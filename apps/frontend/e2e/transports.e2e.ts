// The connection types of #197 in the real window, against the fake vehicle (no SITL): UDP to a vehicle that listens (the app
// sends first), a TCP port the app listens on (the vehicle connects in), and the Found tab, which lists what a fake mDNS
// advertiser announces and connects to it with one key. Connect again (Ctrl+L) goes back to a connection of the new kinds. The
// same against ArduPilot SITL is sitl-transports.e2e.ts.
//
// The checks are in order and each goes on from the one before (one app; the vehicles are started as they are needed).
import { createServer } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chooseConnection, clickConnect, openConnect } from './click'
import { type E2eApp, launchApp } from './launch'
import { FakeAdvertiser } from './mdns-advertiser'
import { CTRL, chord, pageIsReady } from './palette-keys'
import { TcpVehicle } from './tcp-vehicle'

const CONNECT_MS = 30_000
const LONG_MS = 60_000
/** What the top bar's status says once the link is up. */
const CONNECTED = 'connected · system'

let udpVehicle: TcpVehicle | undefined
let tcpVehicle: TcpVehicle | undefined
let advertiser: FakeAdvertiser | undefined
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
 * The UDP port of the vehicle that listens.
 *
 * @returns the port
 * @throws {Error} before it has started
 */
function udpPort(): number {
  if (!udpVehicle) {
    throw new Error('the vehicle has not started')
  }

  return udpVehicle.port
}

/**
 * A TCP port of 127.0.0.1 that nothing listens on now.
 *
 * @returns the port
 */
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise<void>(resolve => {
    server.close(() => resolve())
  })

  return typeof address === 'object' && address ? address.port : 0
}

/**
 * Presses Enter as a keyboard does, with the character it types (a button is pressed by that).
 *
 * @param target the running app
 */
async function pressEnter(target: E2eApp): Promise<void> {
  const event = { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter' }
  await target.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await target.devtools('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...event })
  await target.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/** Starts the vehicle that listens on UDP, the advertiser that announces it, and the app, which asks that advertiser. */
async function startAll(): Promise<void> {
  udpVehicle = await TcpVehicle.startOverUdp()
  advertiser = await FakeAdvertiser.start([
    { instance: 'Fake rover', type: '_mavlink._udp', host: 'rover.local', address: '127.0.0.1', port: udpPort() },
    { instance: 'Nobody home', type: '_mavlink._tcp', host: 'nobody.local', address: '127.0.0.1', port: 9 },
  ])
  process.env.DRONE_CONFIGURATOR_MDNS = advertiser.address
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await pageIsReady(app)
}

/** Stops the vehicles and the advertiser. */
function stopOthers(): void {
  udpVehicle?.stop()
  tcpVehicle?.stop()
  advertiser?.close()
}

/** Stops what is running. */
async function stopAll(): Promise<void> {
  delete process.env.DRONE_CONFIGURATOR_MDNS

  try {
    await app?.close()
  } finally {
    stopOthers()
  }
}

/** Disconnects, and waits until the top bar says so. */
async function disconnect(): Promise<void> {
  await window().click('#disconnect-button')
  await window().waitForText('#connection', 'disconnected', CONNECT_MS)
}

/** UDP client: the app sends to the vehicle's port first, and the vehicle answers. */
async function udpClient(): Promise<void> {
  await chooseConnection(window(), { transport: 'udp-client', host: '127.0.0.1', port: String(udpPort()) })
  await clickConnect(window())
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  await disconnect()
}

/** Ctrl+L: the UDP client connection was kept, and the key connects to it again without the dialog. */
async function connectAgain(): Promise<void> {
  await chord(window(), 'l', CTRL)
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  expect(await window().evaluate<boolean>(`document.querySelector('#connect-button') === null`)).toBe(true)
  await disconnect()
}

/** TCP server: the app listens on a port of this computer only, and the vehicle connects in after Connect was pressed. */
async function tcpServer(): Promise<void> {
  const port = await freePort()
  await chooseConnection(window(), { transport: 'tcp-server', host: '', port: String(port) })
  expect(await window().text('#exposure')).toContain(`Only programs on this computer can reach port ${port}`)
  await clickConnect(window())
  tcpVehicle = await TcpVehicle.connectingTo(port)
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  await disconnect()
  // The vehicle connects again when the app listens again: Connect again goes back to the server.
  await chord(window(), 'l', CTRL)
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  await disconnect()
}

/** The Found tab lists what was announced, and its Connect is reached from the keyboard. */
async function found(): Promise<void> {
  await openConnect(window())
  await window().click('#transport-found')
  await window().waitForText('#found-status', 'Found 2 services.', CONNECT_MS)
  const names = await window().evaluate<string[]>(
    `[...document.querySelectorAll('#found .connect-found-name')].map(e => e.textContent.trim())`,
  )
  expect([...names].sort()).toEqual(['Fake rover', 'Nobody home'])
  const rover = await window().evaluate<number>(
    `[...document.querySelectorAll('#found .connect-found-name')].findIndex(e => e.textContent.trim() === 'Fake rover')`,
  )
  await window().evaluate(`document.querySelector('#found-connect-${rover}').focus()`)
  await pressEnter(window())
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
  expect(advertiser?.queries).toBeGreaterThan(0)
  await disconnect()
}

describe('more connection types and network discovery', () => {
  beforeAll(startAll, LONG_MS)
  afterAll(stopAll)
  it('connects as a UDP client to a vehicle that listens', udpClient, LONG_MS)
  it('connects to it again with one key', connectAgain, LONG_MS)
  it('listens on TCP for the vehicle to connect in, and again with one key', tcpServer, LONG_MS)
  it('lists what the network announces and connects to it from the keyboard', found, LONG_MS)
})
