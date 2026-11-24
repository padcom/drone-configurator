// ArduPilot's frame presets (#41) applied to a real vehicle: ArduPilot SITL (Copter over TCP) in the real window with the real
// backend, and a LOCAL stand-in for GitHub (frame-presets-stand-in.ts; GitHub itself is weekly-frame-presets.e2e.ts, weekly). The
// list is asked for at the vehicle's firmware tag when it reports a released version (CI's pinned SITL does), else at master, and
// the page says which; a preset made up here goes through the review, every change shown (the name the vehicle has not is said,
// and cannot be ticked), and is written only after the confirmation, while the vehicle is disarmed, and read back.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showScreen } from './click'
import { PresetsStandIn, madeUpPresets } from './frame-presets-stand-in'
import { type E2eApp, launchApp } from './launch'
import { openPalette } from './palette-keys'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long a connection, a download or a write may take. */
const WAIT_MS = 60_000
/** The battery capacity the made-up preset sets: not SITL's. */
const CAPACITY = 4321

const stand = new PresetsStandIn()
let sitl: Sitl | undefined
let app: E2eApp | undefined

/**
 * The window.
 *
 * @returns the app
 * @throws {Error} before it has started
 */
function window(): E2eApp {
  if (!app) {
    throw new Error('the app has not started')
  }

  return app
}

/** Starts the stand-in, SITL and the app, connects, and waits for the parameters. */
async function startAll(): Promise<void> {
  stand.presets = madeUpPresets(CAPACITY)
  process.env.DRONE_CONFIGURATOR_PRESETS_URL = await stand.start()
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: sitl.endpoint.host, port: String(sitl.endpoint.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', WAIT_MS)
  await showScreen(app, 'parameters')
  await app.waitForText('#list-status', /^\d+ parameters$/u, 90_000)
}

/** Stops what was started. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
    stand.stop()
    delete process.env.DRONE_CONFIGURATOR_PRESETS_URL
  }
}

/**
 * The git reference the list was asked for at.
 *
 * @returns it, or undefined when it was not asked for
 */
function refAsked(): string | undefined {
  const [asked = ''] = stand.lists()

  return /^\/api\/git\/trees\/(?<ref>[\w.-]+):Tools\/Frame_params\?recursive=1$/u.exec(asked)?.groups?.ref
}

/** Lists the presets at the vehicle's tag, or master, and says which. */
async function listsAtTheVehiclesTag(): Promise<void> {
  await openPalette(window())
  await window().fill('#palette-input', 'frame presets')
  await window().waitFor(`document.querySelector('[data-command="params.presets"]') !== null`)
  await window().click('[data-command="params.presets"]')
  await window().waitFor(`document.querySelector('#presets [data-path]') !== null`, WAIT_MS)

  const ref = refAsked()
  const source = await window().text('#presets-source')
  console.info(`the presets of SITL: ${source}`)
  expect(stand.lists()).toHaveLength(1)
  expect(source).toBe(ref === 'master'
    ? 'From ArduPilot master: the vehicle did not report a released firmware version.'
    : `From ArduPilot ${ref}, the vehicle's firmware.`)
  expect(ref).toMatch(/^(?:master|Copter-\d+\.\d+\.\d+)$/u)
}

/** Applies the made-up preset through the review, and reads it back. */
async function appliesAPresetThroughTheReview(): Promise<void> {
  await window().click('#presets [data-path="E2E-Quad-Long-Range.param"]')
  await window().waitForText('#preset-text', `BATT_CAPACITY,${CAPACITY}`, WAIT_MS)
  await window().waitForText('#presets', 'Every change is shown for review; nothing is written until you confirm.', WAIT_MS)
  await window().click('#preset-review')

  await window().waitForText('#import h3', /^Frame preset: E2E-Quad-Long-Range\.param \(ArduPilot [\w.-]+\)$/u, WAIT_MS)
  await window().waitForText('#import', new RegExp(`BATT_CAPACITY\\s+\\d+\\s+→ ${CAPACITY}`, 'u'))
  await window().waitForText('#import', /NOT_ON_VEHICLE\s+—\s+→ 1\s+not on this vehicle/u)
  expect(await window().evaluate<boolean>(`document.querySelector('input[data-pick="NOT_ON_VEHICLE"]').disabled`)).toBe(true)
  expect(await window().evaluate<boolean>(`document.querySelector('input[data-pick="BATT_CAPACITY"]').checked`)).toBe(true)
  await window().click('#apply')
  await window().waitForText('#question', 'Write 1 parameter to the vehicle (BATT_CAPACITY)?')
  await confirmWrite(window())
  await window().waitForText('#import', `Written and read back: ${CAPACITY}`, WAIT_MS)
  await window().click('#close-import')
}

describeSitl('frame presets applied to a SITL vehicle, from a stand-in for GitHub', () => {
  beforeAll(startAll, 180_000)
  afterAll(stopAll)

  it('lists the presets at the vehicle\'s firmware tag, or master, and says which', listsAtTheVehiclesTag, 120_000)
  it('applies a preset through the review, every change shown, and reads it back', appliesAPresetThroughTheReview, 120_000)
})
