// End to end, in the real window: the View switch of the Parameters screen. It is not there before metadata with a User is
// loaded; then Standard leaves out what ArduPilot marks as advanced, the group counts follow, and a search still finds it.
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
    BATT_CAPACITY: { Description: 'Battery capacity', DisplayName: 'Battery capacity', User: 'Advanced' },
  },
}

let app: E2eApp
let files = ''

// The parameters the list shows, the switch's state, and the count of a group.
const rows = () => app.evaluate<string[]>(`[...document.querySelectorAll('#rows tr[data-id]')].map(r => r.dataset.id)`)
const switchShown = () => app.evaluate<boolean>(`document.querySelector('#param-view') !== null`)
const countOf = (group: string) => app.text(`.param-group[data-group="${group}"] .count`)

beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = files
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', '12 parameters', 60_000)
})

afterAll(async () => {
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  rmSync(files, { recursive: true, force: true })
})

describe('the View switch before and after the metadata', () => {
  it('is not there without metadata, and everything is listed', async () => {
    expect(await switchShown()).toBe(false)
    expect(await rows()).toHaveLength(12)
  })

  it('appears with metadata that has a User, with Full chosen', async () => {
    writeFileSync(join(files, 'open.json'), JSON.stringify(PDEF))
    await app.click('#metadata-button')
    await app.waitFor(`document.querySelector('#param-view') !== null`)

    expect(await app.evaluate<boolean>(`document.querySelector('#param-view input[value="full"]').checked`)).toBe(true)
    expect(await rows()).toHaveLength(12)
  })
})

describe('the View switch in use', () => {
  it('leaves out the advanced parameters in Standard, and the counts follow', async () => {
    await app.click('#param-view .segment:first-child')
    await app.waitForText('#list-status', '11 of 12 parameters')

    expect(await rows()).not.toContain('BATT_CAPACITY')
    expect(await countOf('')).toBe('11')
    expect(await countOf('BATT')).toBe('1')
  })

  it('does not limit a search, and Full brings everything back', async () => {
    await app.fill('#filter', 'BATT_CAPACITY')
    await app.waitFor(`document.querySelector('#rows tr[data-id="BATT_CAPACITY"]') !== null`)
    await app.fill('#filter', '')
    await app.click('#param-view .segment:last-child')
    await app.waitForText('#list-status', '12 parameters')

    expect(await rows()).toContain('BATT_CAPACITY')
  })
})
