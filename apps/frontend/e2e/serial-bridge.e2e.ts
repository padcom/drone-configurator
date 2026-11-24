// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the serial bridge
// (#198). A port of the vehicle (GPS 1) is bridged to a local TCP port; a program (a socket of this test) writes through it, and
// the vehicle's port (a loopback plug in the simulator) sends the bytes back the same way: both ways through the bridge. While it
// runs the page and the top bar say which port is locked, a second program is turned away with a reason, and Stop (from the
// keyboard) gives the port back to the vehicle and closes the local port. The checks go on from one another: one app, one
// connection.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { Program, freePort, listening, openSetupPage, pressEnter, until } from './local-program'
import { TcpVehicle } from './tcp-vehicle'

/** SERIAL_CONTROL_DEV_GPS1. */
const DEV_GPS1 = 2

let vehicle: TcpVehicle | undefined
let app: E2eApp | undefined
let localPort = 0

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
 * The vehicle under test.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function theVehicle(): TcpVehicle {
  if (!vehicle) {
    throw new Error('the vehicle has not started')
  }

  return vehicle
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  localPort = await freePort()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'setup')
  await app.waitFor(`document.querySelector('#setup-progress') !== null`, 120_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

let first: Program | undefined

it('starts a bridge to GPS 1 on a local port, and says the port is locked, on the page and in the top bar', async () => {
  await openSetupPage(window(), 'bridge')
  await window().waitFor(`document.querySelector('#setup-bridge-start')?.disabled === false`, 30_000)
  expect(await window().evaluate<boolean>(`document.querySelector('#serial-bridge-badge') === null`)).toBe(true)
  await window().fill('[data-bridge="device"]', 'GPS1')
  await window().fill('[data-bridge="baud"]', '115200')
  await window().fill('[data-bridge="port"]', String(localPort))
  await window().click('#setup-bridge-start')

  await window().waitFor(`document.querySelector('#setup-bridge-locked') !== null`, 10_000)
  expect(await window().text('#setup-bridge-locked')).toContain('GPS 1 is locked for the bridge until you stop it')
  expect(await window().text('#setup-bridge-locked')).toContain(`127.0.0.1:${localPort}`)
  expect(await window().text('#serial-bridge-badge')).toContain('GPS 1 locked')
  await until('the vehicle says SERIAL_CONTROL took GPS 1', () => theVehicle().serialHeld.has(DEV_GPS1))
})

it('passes bytes both ways: what the program writes reaches the port, and what the port says reaches the program', async () => {
  first = new Program(localPort)
  await window().waitForText('#setup-bridge-client', 'Connected from 127.0.0.1:', 10_000)
  first.socket.write('hello gps')
  // the vehicle's port is a loopback plug: what reached it comes back through the bridge
  await first.reads('hello gps')
  await window().waitForText('#setup-bridge-to', /^9$/u, 5000)
  await window().waitForText('#setup-bridge-from', /^9$/u, 5000)
})

it('turns a second program away with a reason, and goes on serving the first', async () => {
  const second = new Program(localPort)
  await second.reads('one program at a time')
  await until('the second program is closed', () => second.ended)
  await window().waitForText('#setup-bridge-refused-count', /^1$/u, 5000)
  first?.socket.write('still here')
  await first?.reads('still here')
})

it('keeps the badge on another screen, and it leads back to the bridge', async () => {
  await showScreen(window(), 'flight')
  await window().waitFor(`document.querySelector('#serial-bridge-badge') !== null`, 10_000)
  await window().click('#serial-bridge-badge')
  await window().waitFor(`document.querySelector('#setup-bridge-stop') !== null`, 30_000)
})

it('stops from the keyboard: the port goes back to the vehicle and the local port closes', async () => {
  await window().evaluate(`document.querySelector('#setup-bridge-stop').focus()`)
  await pressEnter(window())

  await window().waitFor(`document.querySelector('#setup-bridge-locked') === null`, 10_000)
  await until('the vehicle says the port was handed back', () => theVehicle().serialReleases === 1)
  expect(theVehicle().serialHeld.has(DEV_GPS1)).toBe(false)
  expect(await window().text('#setup-bridge-said')).toContain('GPS 1 is the vehicle\'s own again.')
  expect(await window().evaluate<boolean>(`document.querySelector('#serial-bridge-badge') === null`)).toBe(true)
  await until('the program is let go', () => first?.ended === true)
  expect(await listening(localPort)).toBe(false)
})
