// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): Take off is a
// command of the palette, and it is not to be run while the vehicle reports no 3D GPS fix (this simulator reports none). The
// dialog and the flow behind it are in the unit tests, with a vehicle that is ready; what the real autopilot does is SITL's.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { chord, openPalette } from './palette-keys'
import { sleep, Strip } from './strip'
import { TcpVehicle } from './tcp-vehicle'

let vehicle: TcpVehicle | undefined
let app: E2eApp | undefined

/**
 * The app under test.
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

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  const listed = `document.body.innerText.includes('Parameters: ') && !document.body.innerText.includes('Downloading')`
  await app.waitFor(listed, 60_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('is in the palette, but not to be run: the simulated vehicle reports no GPS fix, and the row says why', async () => {
  await new Strip(window()).heartbeatSays(false)
  await openPalette(window())
  await window().fill('#palette-input', 'take off')
  const row = `document.querySelector('.palette-row[data-command="vehicle.takeoff"]')`
  await window().waitFor(`${row} !== null`, 10_000)

  expect(await window().evaluate<string | null>(`${row}.getAttribute('aria-disabled')`)).toBe('true')
  expect(await window().text('#palette-reason-vehicle\\.takeoff')).toContain('3D GPS fix')
  // (Enter on a row that cannot run opens nothing)
  await chord(window(), 'Enter')
  await sleep(500)

  expect(await new Strip(window()).exists('#takeoff-altitude')).toBe(false)
})
