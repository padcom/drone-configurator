// End to end, in the real window: a new list starts from its top. A short window makes the dozen parameters scroll; then a
// change of the search, a group chosen and a change of the view scroll the list to its top and select its first row, and
// the typing in the search goes on (the focus stays).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'

const PDEF = {
  json: { version: 0 },
  ArduCopter: {
    RTL_ALT: { Description: 'Return altitude', DisplayName: 'RTL Altitude', User: 'Standard' },
    ARMING_CHECK: { Description: 'Checks', DisplayName: 'Checks', User: 'Advanced' },
  },
}

let app: E2eApp
let files = ''

const top = () => app.evaluate<number>(`document.querySelector('.param-scroll').scrollTop`)
const selected = () => app.evaluate<string>(`document.querySelector('#rows tr.selected')?.dataset.id ?? ''`)
const scrollDown = () => app.evaluate(`document.querySelector('.param-scroll').scrollTop = 200`)

beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
  await app.devtools('Emulation.setDeviceMetricsOverride', { width: 1440, height: 420, deviceScaleFactor: 1, mobile: false })
  await app.evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
})

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

describe('a new list', () => {
  it('starts at the top, with its first row selected, when the search changes, and the focus stays in the search', async () => {
    await scrollDown()
    expect(await top()).toBeGreaterThan(0)
    await app.click('#filter')

    await app.fill('#filter', 'S')

    await app.waitFor(`document.querySelector('.param-scroll').scrollTop === 0`)
    expect(await selected()).not.toBe('')
    expect(await app.evaluate<string>('document.activeElement.id')).toBe('filter')
    await app.fill('#filter', '')
    await app.waitFor(`document.querySelector('#rows tr.selected')?.dataset.id === 'ARMING_CHECK'`)
  })
})

describe('a new list, from a group and from a view', () => {
  it('starts at the top, with its first row selected, when a group is chosen', async () => {
    await scrollDown()

    await app.click('.param-group[data-group="BATT"]')

    await app.waitFor(`document.querySelector('.param-scroll').scrollTop === 0`)
    expect(await selected()).toBe('BATT_CAPACITY')
    await app.click('.param-group[data-group=""]')
  })

  it('starts at the top, with its first row selected, when the view changes', async () => {
    writeFileSync(join(files, 'open.json'), JSON.stringify(PDEF))
    await app.click('#metadata-button')
    await app.waitFor(`document.querySelector('#param-view') !== null`)
    await scrollDown()

    await app.click('#param-view .segment:first-child')

    await app.waitFor(`document.querySelector('.param-scroll').scrollTop === 0`)
    expect(await selected()).toBe('BATT_CAPACITY')
  })
})
