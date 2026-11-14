// End to end, in the real window with the real backend, no vehicle: Tune, Analyse over real DataFlash files in the library of
// logs (the backend reads them, the page asks `logs.local.series` in its two passes). The three logs are written by the test (see
// dataflash.ts): one whose desired roll rate steps from 0 to 57 deg/s at 10 s, with an actual rate a first-order lag of 100 ms
// behind it (a rise of about 0.22 s, no overshoot); one with RATE whose desired rate never jumps; one with no RATE at all. The
// page shows the step and its numbers for the first, "No suitable step in this log" for the second, and names the LOG_BITMASK
// bits for the third. Not covered: a log written by ArduPilot, and a log with several steps.
import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { copyName, flightLog } from './dataflash'
import { showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'

/** The library of logs of the app, and the folder of the vehicle of the test logs in it. */
const FOLDER = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator', 'logs', 'uid-e2e')

let app: E2eApp

/**
 * Puts a log in the library, with the age of a log: a larger number is a newer one.
 *
 * @param id the number of the log
 * @param rate whether it has RATE
 * @param step whether its desired rate steps
 * @returns its key in the library
 */
function putLog(id: number, rate: boolean, step: boolean): string {
  const bytes = flightLog({ rate, step })
  const name = copyName(id, bytes)
  const path = join(FOLDER, name)
  writeFileSync(path, bytes)
  const when = new Date(Date.UTC(2026, 0, id))
  utimesSync(path, when, when)

  return `uid-e2e/${name}`
}

/** The keys of the logs the tests put in the library. */
const KEYS = { stepped: '', flat: '', noRate: '' }

beforeAll(async () => {
  mkdirSync(FOLDER, { recursive: true })
  KEYS.noRate = putLog(1, false, true)
  KEYS.flat = putLog(2, true, false)
  KEYS.stepped = putLog(3, true, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'tune')
  await app.click('a[href="#/tune/analyse"]')
  await app.waitFor(`document.querySelector('#tune-analyse-log option') !== null`, 60_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
})

/**
 * Chooses a log in the picker.
 *
 * @param key its key
 */
async function chooseLog(key: string): Promise<void> {
  await app.evaluate(`(() => {
    const select = document.querySelector('#tune-analyse-log')
    select.value = ${JSON.stringify(key)}
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

/** Presses Analyse and waits until the passes are over (the steps, or the words for no step). */
async function analyse(): Promise<void> {
  await app.click('#tune-analyse-run')
  const over = ['steps', 'none', 'error'].map(id => `document.querySelector('#tune-analyse-${id}') !== null`).join(' || ')
  await app.waitFor(over, 120_000)
  const error = await app.evaluate<string>(`document.querySelector('#tune-analyse-error')?.textContent ?? ''`)
  expect(error).toBe('')
}

/**
 * The number in the text of a metric (`16.3 %`, `110 ms`).
 *
 * @param id the element
 * @returns the number, or NaN for a dash
 */
async function metric(id: string): Promise<number> {
  return Number.parseFloat(await app.text(id))
}

it('has the newest log chosen (the last flight) and reads nothing until Analyse is pressed', async () => {
  expect(await app.evaluate<string>(`document.querySelector('#tune-analyse-log').value`)).toBe(KEYS.stepped)
  expect(await app.evaluate<boolean>(`document.querySelector('#tune-analyse-steps') === null`)).toBe(true)
})

it('finds the step of the last flight, and measures it: a rise of about 0.22 s and no overshoot', async () => {
  await analyse()

  expect(await app.evaluate<boolean>(`document.querySelector('#tune-analyse-error') === null`)).toBe(true)
  expect(await app.evaluate<number>(`document.querySelectorAll('#tune-analyse-steps tbody tr').length`)).toBe(1)
  expect(await app.text('#tune-analyse-steps tbody tr td:nth-child(2)')).toContain('57')
  // the window is drawn with both lines, and the numbers are the ones of the lag
  await app.waitFor(`document.querySelectorAll('#tune-analyse-chart .chart-series .line').length === 2`, 30_000)
  expect(await metric('#tune-analyse-rise')).toBeGreaterThan(150)
  expect(await metric('#tune-analyse-rise')).toBeLessThan(300)
  expect(await metric('#tune-analyse-overshoot')).toBeLessThan(2)
  expect(await app.text('#tune-analyse-step')).toContain('0 to 57')
})

it('says there is no suitable step in a log whose desired rate does not jump', async () => {
  await chooseLog(KEYS.flat)
  await analyse()
  await app.waitFor(`document.querySelector('#tune-analyse-none') !== null`, 30_000)

  expect(await app.text('#tune-analyse-none')).toContain('No suitable step in this log')
  expect(await app.evaluate<boolean>(`document.querySelector('#tune-analyse-chart') === null`)).toBe(true)
})

it('says a log has no RATE messages and names the bits of LOG_BITMASK that make the vehicle log them', async () => {
  await chooseLog(KEYS.noRate)
  await analyse()
  await app.waitFor(`document.querySelector('#tune-analyse-none')?.textContent.includes('no RATE messages')`, 30_000)

  const said = await app.text('#tune-analyse-none')
  expect(said).toContain('ATTITUDE_FAST')
  expect(said).toContain('ATTITUDE_MED')
})
