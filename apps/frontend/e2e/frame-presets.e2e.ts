// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL), against a LOCAL
// stand-in for GitHub (frame-presets-stand-in.ts; never GitHub itself, never ArduPilot's own presets): ArduPilot's frame presets
// (#41). From the palette, the presets open on the Parameters screen with the focus in their search; the page says which git
// reference the list is at (the simulator reports no released version: master, and why); the search narrows it; the arrow keys
// select a preset and its contents show; "Review and apply" puts every change under review, the one the vehicle cannot take said
// and not ticked; nothing is written until the confirmation, and the value is read back. The list is asked for once and kept,
// and a stale one is used, and said, when GitHub refuses. Setup › Frame leads to them too.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showScreen } from './click'
import { PresetsStandIn } from './frame-presets-stand-in'
import { type E2eApp, launchApp } from './launch'
import { openPalette } from './palette-keys'
import { TcpVehicle } from './tcp-vehicle'

/** How long a connection, a download or a write may take. */
const WAIT_MS = 30_000

const stand = new PresetsStandIn()
let app: E2eApp
let vehicle: TcpVehicle

/**
 * Presses a key on what has the focus, as the host receives it.
 *
 * @param key the key's name
 * @param code its virtual key code
 */
async function press(key: string, code: number): Promise<void> {
  const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: key }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })

  // (a native button acts on the character Enter types)
  if (key === 'Enter') {
    await app.devtools('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...event })
  }
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/** Opens the presets from the palette, and waits for the list. */
async function openFromPalette(): Promise<void> {
  await openPalette(app)
  await app.fill('#palette-input', 'frame presets')
  await app.waitFor(`document.querySelector('[data-command="params.presets"]') !== null`)
  await app.click('[data-command="params.presets"]')
  await app.waitFor(`document.querySelector('#presets [data-path]') !== null`, WAIT_MS)
}

/**
 * The id of what has the focus.
 *
 * @returns it
 */
const focused = () => app.evaluate<string>('document.activeElement?.id ?? ""')

/**
 * The paths of the rows shown.
 *
 * @returns them
 */
const rows = () => app.evaluate<string[]>(`[...document.querySelectorAll('#presets [data-path]')].map(row => row.dataset.path)`)

beforeAll(async () => {
  process.env.DRONE_CONFIGURATOR_PRESETS_URL = await stand.start()
  vehicle = await TcpVehicle.startDisarmed()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', WAIT_MS)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters$/u, WAIT_MS)
}, 180_000)

afterAll(async () => {
  await app?.close()
  vehicle?.stop()
  stand.stop()
  delete process.env.DRONE_CONFIGURATOR_PRESETS_URL
})

it('opens from the palette with the focus in the search, says where the list is from, and narrows it', async () => {
  await openFromPalette()

  await app.waitFor(`document.activeElement?.id === 'presets-search'`)
  expect(await app.text('#presets-source'))
    .toBe('From ArduPilot master: the vehicle did not report a released firmware version.')
  expect(stand.lists()).toEqual(['/api/git/trees/master:Tools/Frame_params?recursive=1'])
  // The presets only: not the folder or the README beside them.
  expect(await rows()).toEqual(['E2E-Quad-Long-Range.param', 'QuadPlanes/E2E-Plane.parm', 'Sub/e2e-sub.params'])
  await app.fill('#presets-search', 'quad long')
  await app.waitFor(`document.querySelectorAll('#presets [data-path]').length === 1`)
  expect(await app.text('#presets-count')).toBe('1 of 3 presets')
  await app.fill('#presets-search', '')
  await app.waitFor(`document.querySelectorAll('#presets [data-path]').length === 3`)
}, 90_000)

it('selects a preset with the keys, shows its contents, and applies it through the review, read back', async () => {
  // The table is one tab stop: the focus goes in, and the arrows select.
  await app.click(`#presets [data-path="QuadPlanes/E2E-Plane.parm"]`)
  await app.waitForText('#preset-text', 'Q_ENABLE 1', WAIT_MS)
  await press('ArrowUp', 38)
  await app.waitForText('#preset-name', 'E2E-Quad-Long-Range', WAIT_MS)
  await app.waitForText('#preset-text', 'BATT_CAPACITY,4321', WAIT_MS)
  expect(stand.files()).toEqual([
    '/raw/master/Tools/Frame_params/QuadPlanes/E2E-Plane.parm',
    '/raw/master/Tools/Frame_params/E2E-Quad-Long-Range.param',
  ])
  // Once the vehicle is known to be disarmed (its heartbeat says so), the preset may go to the review.
  await app.waitForText('#presets', 'Every change is shown for review; nothing is written until you confirm.', WAIT_MS)

  // "Review and apply", from the keyboard.
  await app.evaluate(`document.querySelector('#preset-review').focus()`)
  expect(await focused()).toBe('preset-review')
  await press('Enter', 13)
  await app.waitForText('#import h3', 'Frame preset: E2E-Quad-Long-Range.param (ArduPilot master)', WAIT_MS)
  await app.waitForText('#import', /BATT_CAPACITY\s+5200\s+→ 4321/u)
  await app.waitForText('#import', /NOT_ON_VEHICLE\s+—\s+→ 1\s+not on this vehicle/u)
  expect(await app.evaluate<boolean>(`document.querySelector('input[data-pick="BATT_CAPACITY"]').checked`)).toBe(true)
  expect(await app.evaluate<boolean>(`document.querySelector('input[data-pick="NOT_ON_VEHICLE"]').disabled`)).toBe(true)
  expect(vehicle.writes).toBe(0)

  await app.click('#apply')
  await app.waitForText('#question', 'Write 1 parameter to the vehicle (BATT_CAPACITY)?')
  await confirmWrite(app)
  await app.waitForText('#import', 'Written and read back: 4321', WAIT_MS)
  expect(vehicle.writes).toBe(1)
  await app.click('#close-import')
}, 90_000)

it('keeps the list and the presets on this computer, and uses them, said, when GitHub refuses', async () => {
  const lists = stand.lists().length
  const files = stand.files().length
  await openFromPalette()
  await app.click(`#presets [data-path="E2E-Quad-Long-Range.param"]`)
  await app.waitForText('#preset-text', 'BATT_CAPACITY,4321', WAIT_MS)
  await app.waitForText('#presets-freshness', 'Kept on this computer.', WAIT_MS)
  expect(stand.lists()).toHaveLength(lists)
  expect(stand.files()).toHaveLength(files)

  stand.mode = 'limited'
  await app.click('#presets-refresh')
  await app.waitForText('#presets-freshness', 'Kept on this computer: GitHub could not be asked for a newer list.', WAIT_MS)
  expect(stand.lists()).toHaveLength(lists + 1)
  stand.mode = 'up'
  await app.click('#close-presets')
  await app.waitFor(`document.querySelector('#presets') === null`)
}, 90_000)

it('is reached from Setup › Frame', async () => {
  await showScreen(app, 'setup')
  await app.click('a[href="#/setup/frame"]')
  await app.waitFor(`document.querySelector('#setup-frame-presets') !== null`, WAIT_MS)
  await app.click('#setup-frame-presets')
  await app.waitFor(`document.querySelector('#presets [data-path]') !== null`, WAIT_MS)
  await app.click('#close-presets')
}, 90_000)
