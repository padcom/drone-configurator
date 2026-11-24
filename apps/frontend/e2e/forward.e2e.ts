// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): Settings,
// Forward MAVLink (#34). A program is added from the keyboard (Enter in the form), the vehicle's MAVLink reaches it over UDP,
// and a second station there reads a parameter through the forward (its request goes through the app to the vehicle, the
// answer comes back); the row says it is up and counts what was sent. Turned off (Enter on its switch), nothing more arrives.
// A TCP program nobody listens to is said to be refused, with the reason, and the app's own link goes on. The SITL version is
// sitl-forward.e2e.ts.
import { createServer } from 'node:net'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { ForwardStation } from './forward-station'
import { type E2eApp, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

/** The vehicle's ids (the simulated vehicle's). */
const VEHICLE = { systemId: 1, componentId: 1 }
/** How long a connection or an answer through the forward may take. */
const WAIT_MS = 30_000

let app: E2eApp
let vehicle: TcpVehicle
let station: ForwardStation

/**
 * Waits.
 *
 * @param ms how long
 * @returns when it has
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

/**
 * A TCP port nobody listens on (one that was free a moment ago).
 *
 * @returns the port
 */
async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as { port: number }
  await new Promise(resolve => {
    server.close(resolve)
  })

  return port
}

/**
 * Presses Enter as a keyboard does, with the character it types (`press` sends none for a named key, and a browser submits a
 * form, or presses a focused button, on that character).
 */
async function pressEnter(): Promise<void> {
  const key = { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter' }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
  await app.devtools('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...key })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
}

/**
 * Adds a program from the keyboard: the fields filled, then Enter in the port field.
 *
 * @param kind `udp` or `tcp`
 * @param port its port
 */
async function addFromTheKeyboard(kind: string, port: number): Promise<void> {
  await app.fill('.forward-add select', kind)
  await app.fill('.forward-host input', '127.0.0.1')
  await app.fill('.forward-port input', String(port))
  await app.evaluate(`document.querySelector('.forward-port input').focus()`)
  await pressEnter()
}

/**
 * The text of the row of a program.
 *
 * @param key its key (`udp:127.0.0.1:14550`)
 * @param part which part of the row
 * @returns its text
 */
const rowText = (key: string, part: string) => app.text(`.forward-row[data-key="${key}"] ${part}`)

beforeAll(async () => {
  vehicle = await TcpVehicle.start()
  station = await ForwardStation.open()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('.settings-forward') !== null`, 60_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
  vehicle?.stop()
  station?.close()
})

it('forwards nothing until a program is added, and adds one from the keyboard', async () => {
  expect(await app.text('#forward-empty')).toBe('No programs. Nothing is forwarded.')
  await addFromTheKeyboard('udp', station.port)

  const key = `udp:127.0.0.1:${station.port}`
  await app.waitFor(`document.querySelector('.forward-row[data-key="${key}"]') !== null`, WAIT_MS)
  expect(await rowText(key, '.forward-state')).toBe('Waits for a vehicle')
})

it('forwards the vehicle to it, and a second station reads a parameter through the forward', async () => {
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', WAIT_MS)

  await station.waitForHeartbeat(VEHICLE.systemId, WAIT_MS)
  const value = await station.readParam(VEHICLE, 'RTL_ALT', WAIT_MS)
  expect(Number.isFinite(value)).toBe(true)

  await showScreen(app, 'settings')
  const key = `udp:127.0.0.1:${station.port}`
  await app.waitForText(`.forward-row[data-key="${key}"] .forward-state`, 'Up', WAIT_MS)
  await app.waitForText(`.forward-row[data-key="${key}"] .forward-counts`, /^Sent [1-9]/u, WAIT_MS)
})

it('turns a program off from the keyboard: nothing more arrives', async () => {
  const key = `udp:127.0.0.1:${station.port}`
  await app.evaluate(`document.querySelector('.forward-row[data-key="${key}"] .forward-on').focus()`)
  await pressEnter()
  await app.waitForText(`.forward-row[data-key="${key}"] .forward-state`, 'Off', WAIT_MS)

  // (a frame that was on its way when it was turned off may still come)
  await sleep(500)
  station.clear()
  // The vehicle sends a heartbeat every second: none comes in three.
  await sleep(3000)
  expect(station.frames).toHaveLength(0)
})

it('says a TCP program nobody listens to is refused, and the vehicle stays connected', async () => {
  const port = await closedPort()
  await addFromTheKeyboard('tcp', port)

  const key = `tcp:127.0.0.1:${port}`
  await app.waitForText(`.forward-row[data-key="${key}"] .forward-state`, 'Refused', WAIT_MS)
  expect(await rowText(key, '.forward-error')).toMatch(/^Not reached: .+\. A TCP program is tried again every 2 s\.$/u)
  expect(await app.text('#connection')).toContain('connected · system')
})
