// One-key connect (#27) in the real window, against the fake vehicle (the simulated vehicle behind a TCP port, no SITL): the
// connection that was made is kept, and with the link down Ctrl+L, or one click on "Connect again", connects to it again from
// any screen, without the dialog. After a restart the dialog opens on it and the key still works. The 2 s budget of the key
// against ArduPilot SITL is sitl-one-key.e2e.ts.
//
// The checks are in order and each goes on from the one before (one vehicle; the app is started again once).
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chooseConnection, clickConnect, openConnect, showScreen } from './click'
import { CTRL, chord, pageIsReady } from './palette-keys'
import { TcpVehicle } from './tcp-vehicle'

const CONNECT_MS = 30_000
const LONG_MS = 60_000
/** What the top bar's status says once the link is up. */
const CONNECTED = 'connected · system'

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

/**
 * The fake vehicle's port.
 *
 * @returns the port
 * @throws {Error} before it has started
 */
function vehiclePort(): number {
  if (!vehicle) {
    throw new Error('the vehicle has not started')
  }

  return vehicle.port
}

/** Starts the vehicle and the app. */
async function startAll(): Promise<void> {
  vehicle = await TcpVehicle.start()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await pageIsReady(app)
}

/** Stops what is running. */
async function stopAll(): Promise<void> {
  await app?.close()
  vehicle?.stop()
}

/** Disconnects, and waits until the top bar says so. */
async function disconnect(): Promise<void> {
  await window().click('#disconnect-button')
  await window().waitForText('#connection', 'disconnected', CONNECT_MS)
}

/** Connects to the fake vehicle through the dialog, and disconnects again: the connection is kept as the last one. */
async function connectsThroughTheDialog(): Promise<void> {
  await chooseConnection(window(), { transport: 'tcp', host: '127.0.0.1', port: String(vehiclePort()) })
  await clickConnect(window())
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  await disconnect()
}

/** Ctrl+L from another screen: connected again, without the dialog. */
async function oneKey(): Promise<void> {
  await showScreen(window(), 'parameters')
  await chord(window(), 'l', CTRL)
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  expect(await window().evaluate<boolean>(`document.querySelector('#connect-button') === null`)).toBe(true)
  await disconnect()
}

/** One click on "Connect again" in the top bar. */
async function oneClick(): Promise<void> {
  await window().click('#connect-again')
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  // With the link up it is not offered.
  await window().waitFor(`document.querySelector('#connect-again') === null`)
  await disconnect()
}

/** After a restart: the dialog opens on the connection that was kept, and the key connects to it. */
async function keptAfterARestart(): Promise<void> {
  expect(await window().close()).toBe(0)
  app = await launchApp()
  await window().waitForText('#connection', 'disconnected')
  await pageIsReady(window())
  await openConnect(window())
  const pressed = `document.querySelector('#transport-tcp').getAttribute('aria-pressed')`
  expect(await window().evaluate<string>(pressed)).toBe('true')
  expect(await window().evaluate<string>(`document.querySelector('#port').value`)).toBe(String(vehiclePort()))
  await window().click('#connect-cancel')
  await window().waitFor(`document.querySelector('#connect-button') === null`)
  await chord(window(), 'l', CTRL)
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
}

describe('one-key connect to the fake vehicle', () => {
  beforeAll(startAll, LONG_MS)
  afterAll(stopAll)
  it('connects through the dialog, which keeps the connection', connectsThroughTheDialog, LONG_MS)
  it('connects to it again with one key, from another screen and without the dialog', oneKey, LONG_MS)
  it('connects to it again with one click on Connect again', oneClick, LONG_MS)
  it('opens the dialog on it after a restart, and the key still connects', keptAfterARestart, LONG_MS)
})
