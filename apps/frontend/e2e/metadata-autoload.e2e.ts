// End to end, in the real window with the real backend and a settings file of the test's own: the parameter metadata file the
// settings name is loaded when the application starts (the description of a parameter is there without anyone loading it),
// nothing is loaded with the switch off (the path is kept), a file that is not there is said once with its path and the path is
// kept, and a file loaded by hand is the one loaded at the next start. A settings file with neither key is an install from before
// the feature: on, with nothing to load.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, afterAll, expect, it } from 'vitest'
import { clickConnect, showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'

const DATA = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')
const SETTINGS = join(DATA, 'settings.json')
const DESCRIPTION = 'The minimum alt above home the vehicle will climb to before returning.'
const PDEF = JSON.stringify({
  json: { version: 0 },
  ArduCopter: {
    RTL_ALT: { Increment: '1', Range: { high: '300000', low: '30' }, Units: 'cm', Description: DESCRIPTION, DisplayName: 'RTL' },
  },
})

let app: E2eApp | undefined
let folder = ''

/**
 * Writes the settings file the next start reads.
 *
 * @param ui the entries of the settings
 */
function settings(ui: [string, string][]): void {
  mkdirSync(DATA, { recursive: true })
  writeFileSync(SETTINGS, JSON.stringify({ version: 1, ui: ui.map(([key, value]) => ({ key, value })) }))
}

/**
 * Starts the application.
 *
 * @returns the window
 */
async function start(): Promise<E2eApp> {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')

  return app
}

/**
 * Connects the simulated vehicle and selects RTL_ALT on the Parameters screen.
 *
 * @param window the application
 */
async function selectRtlAlt(window: E2eApp): Promise<void> {
  await clickConnect(window)
  await window.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(window, 'parameters')
  await window.waitForText('#list-status', '12 parameters', 60_000)
  await window.click('tr[data-id="RTL_ALT"]')
}

/**
 * The toasts that are shown.
 *
 * @param window the application
 * @returns their texts
 */
function toasts(window: E2eApp): Promise<string[]> {
  return window.evaluate<string[]>(`[...document.querySelectorAll('.kit-toast')].map(toast => toast.textContent.trim())`)
}

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'drone-configurator-e2e-metadata-'))
  writeFileSync(join(folder, 'apm.pdef.json'), PDEF)
})

afterEach(async () => {
  const running = app
  app = undefined
  await running?.close()
  rmSync(SETTINGS, { force: true })
})

afterAll(() => {
  rmSync(folder, { recursive: true, force: true })
})

it('loads the file the settings name at start, for an install from before the switch (no switch entry)', async () => {
  settings([['metadata.path', join(folder, 'apm.pdef.json')]])
  const window = await start()
  await selectRtlAlt(window)

  expect(await window.waitForText('#param-description', new RegExp(DESCRIPTION, 'u'))).toContain('30 to 300000 cm')
  // it went well: nothing is said about the metadata (the download of the parameters has its own toast)
  expect((await toasts(window)).filter(text => /metadata|descriptions/iu.test(text))).toEqual([])
})

it('loads nothing with the switch off, and the path is still there in Settings', async () => {
  settings([['metadata.path', join(folder, 'apm.pdef.json')], ['metadata.autoload', 'off']])
  const window = await start()
  await selectRtlAlt(window)

  expect(await window.waitForText('#param-description', /Load the parameter metadata/u)).not.toContain('The minimum alt')
  await showScreen(window, 'settings')
  const path = await window.evaluate<string>(`document.querySelector('.settings input[type="text"]').value`)
  expect(path).toBe(join(folder, 'apm.pdef.json'))
  expect(await window.evaluate<string>(`document.querySelector('#metadata-autoload').getAttribute('aria-checked')`)).toBe('false')
})

it('says once, with the path, that the file is not there, keeps the path, and the application is up', async () => {
  const gone = join(folder, 'gone.json')
  settings([['metadata.path', gone]])
  const window = await start()

  const toast = await window.waitForText('.kit-toast', /Can't load the metadata from/u)
  expect(toast).toContain(gone)
  expect(toast).toContain('no such file')
  await new Promise(resolve => {
    setTimeout(resolve, 1500)
  })
  expect(await toasts(window)).toHaveLength(1)
  await showScreen(window, 'settings')
  expect(await window.evaluate<string>(`document.querySelector('.settings input[type="text"]').value`)).toBe(gone)
})

it('has the file loaded by hand loaded at the next start', async () => {
  // Instead of the native file dialog, which a test cannot click (the backend's FileChooser).
  process.env.DRONE_CONFIGURATOR_TEST_FILES = folder
  writeFileSync(join(folder, 'open.json'), PDEF)
  settings([])
  let window = await start()
  await selectRtlAlt(window)
  await window.click('#metadata-button')
  await window.waitForText('#param-description .text', new RegExp(DESCRIPTION, 'u'))
  await window.waitFor(`document.querySelector('.kit-toast.sev-success') !== null`, 10_000)
  await app?.close()
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES

  // what the backend kept: the path of the file that was loaded, and nothing else about it
  const kept = JSON.parse(readFileSync(SETTINGS, 'utf8')) as { ui: { key: string, value: string }[] }
  expect(kept.ui.find(entry => entry.key === 'metadata.path')?.value).toBe(join(folder, 'open.json'))
  // the next start loads it, with no one asking
  window = await start()
  await selectRtlAlt(window)
  expect(await window.waitForText('#param-description', new RegExp(DESCRIPTION, 'u'))).toContain('30 to 300000 cm')
})
