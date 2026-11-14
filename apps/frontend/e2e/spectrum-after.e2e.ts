// End to end, in the real window with the real backend, no vehicle: Logs > Spectrum before and after the vehicle's filters, over
// logs the test writes into the library (see batches.ts): one with INS_LOG_BAT_OPT 2 (every batch is after the filters), one
// with 4 (before and after: a gyro 0 that shakes at 2 rad/s and the same IMU after the filters, instance 3, at a tenth of it),
// and one with no PARM of the option. The page labels the sources only when the log says, draws the two charts of a paired IMU
// on one vertical scale, and says why there is no second chart. Not covered: a log ArduPilot wrote with the option set.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { batchLog } from './batches'
import { copyName } from './dataflash'
import { showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'

const FOLDER = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator', 'logs', 'uid-e2e')

let app: E2eApp

/**
 * Puts a log in the library.
 *
 * @param id the number of the log
 * @param bytes the log
 * @returns its key
 */
function putLog(id: number, bytes: Buffer): string {
  const name = copyName(id, bytes)
  writeFileSync(join(FOLDER, name), bytes)

  return `uid-e2e/${name}`
}

const KEYS = { afterOnly: '', paired: '', unknown: '' }

beforeAll(async () => {
  mkdirSync(FOLDER, { recursive: true })
  KEYS.afterOnly = putLog(1, batchLog(2, [{ instance: 0, amplitude: 2 }, { instance: 1, amplitude: 2 }]))
  KEYS.paired = putLog(2, batchLog(4, [{ instance: 0, amplitude: 2 }, { instance: 3, amplitude: 0.2 }]))
  KEYS.unknown = putLog(3, batchLog(undefined, [{ instance: 0, amplitude: 2 }]))
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'logs')
  await app.click('a[href="#/logs/spectrum"]')
  await app.waitFor(`document.querySelectorAll('#spectrum-log option').length > 3`, 60_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
})

/**
 * Opens a log in Spectrum and waits until its spectrum is drawn.
 *
 * @param key its key in the library
 */
async function open(key: string): Promise<void> {
  await app.evaluate(`(() => {
    const select = document.querySelector('#spectrum-log')
    select.value = ${JSON.stringify(key)}
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await app.waitFor(`document.querySelector('#spectrum-busy') === null && document.querySelector('.spectrum-chart') !== null
    && document.querySelector('#spectrum-log').value === ${JSON.stringify(key)}`, 120_000)
}

/**
 * The labels of the sources in the picker.
 *
 * @returns the texts
 */
function sourceLabels(): Promise<string[]> {
  return app.evaluate<string[]>(`[...document.querySelectorAll('#spectrum-source option')].map(option => option.textContent)`)
}

/** The y tick labels of each chart that is drawn. */
const TICKS = `JSON.stringify([...document.querySelectorAll('.spectrum-chart')].map(chart =>
  [...chart.querySelectorAll('.chart-grid .spectrum-tick')].map(tick => tick.textContent)))`

it('says a log whose batches are all after the filters says so, and has no second chart', async () => {
  await open(KEYS.afterOnly)

  const labels = await sourceLabels()
  expect(labels).toEqual([
    'Gyro 0: 2 batches at 1,000 Hz · after the filters',
    'Gyro 1: 2 batches at 1,000 Hz · after the filters',
  ])
  expect(await app.text('#spectrum-after-text')).toContain('This is the data after')
  expect(await app.evaluate<number>(`document.querySelectorAll('.spectrum-chart').length`)).toBe(1)
})

it('draws a gyro before the filters and the same IMU after them on one vertical scale', async () => {
  await open(KEYS.paired)

  const labels = await sourceLabels()
  expect(labels).toEqual([
    'Gyro 0: 2 batches at 1,000 Hz · before the filters',
    'Gyro 3: 2 batches at 1,000 Hz · after the filters',
  ])
  await app.waitFor(`document.querySelector('#spectrum-after-chart') !== null`, 60_000)
  const ticks = JSON.parse(await app.evaluate<string>(TICKS)) as string[][]

  expect(ticks).toHaveLength(2)
  expect(ticks[0]?.length).toBeGreaterThan(2)
  expect(ticks[1]).toEqual(ticks[0])
  expect(await app.text('#spectrum-after-text')).toContain('same vertical scale')
})

it('says why there is no spectrum after the filters when the log does not say which batches they are', async () => {
  await open(KEYS.unknown)

  expect(await app.text('#spectrum-after-text')).toContain('does not say whether')
  expect(await app.evaluate<number>(`document.querySelectorAll('.spectrum-chart').length`)).toBe(1)
})
