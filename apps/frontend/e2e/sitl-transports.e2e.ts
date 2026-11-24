// The connection types of #197 against ArduPilot SITL: a TCP port the app listens on, which SITL connects to (its SERIAL2
// started as `tcpclient:`), and UDP to a router that listens (udp-relay.ts, as MAVProxy's `udpin` does: SITL has no UDP port
// that listens), typed in and picked from the Found tab, where a fake mDNS advertiser announces it. Each SITL is started for its
// test and stopped after. It launches its own SITL, so it ignores SITL_ENDPOINT. The same against the fake vehicle is
// transports.e2e.ts.
import { createServer } from 'node:net'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, openConnect } from './click'
import { type E2eApp, launchApp } from './launch'
import { FakeAdvertiser } from './mdns-advertiser'
import { pageIsReady } from './palette-keys'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'
import { UdpRelay } from './udp-relay'

/** SITL starting (up to 60 s) and the link coming up. */
const TEST_MS = 180_000
const CONNECT_MS = 60_000
/** What the top bar's status says once the link is up with SITL's autopilot. */
const CONNECTED = /connected · system 1\/1/u

let app: E2eApp | undefined
let sitl: Sitl | undefined
let relay: UdpRelay | undefined
let advertiser: FakeAdvertiser | undefined

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
 * The relay that stands for a router that listens.
 *
 * @returns the relay
 * @throws {Error} before it has started
 */
function router(): UdpRelay {
  if (!relay) {
    throw new Error('the relay has not started')
  }

  return relay
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

/** Starts the relay, the advertiser that announces it, and the app, which asks that advertiser. */
async function startAll(): Promise<void> {
  relay = await UdpRelay.start()
  advertiser = await FakeAdvertiser.start([
    { instance: 'SITL copter', type: '_mavlink._udp', host: 'sitl.local', address: '127.0.0.1', port: relay.port },
  ])
  process.env.DRONE_CONFIGURATOR_MDNS = advertiser.address
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await pageIsReady(app)
}

/** Stops what is running. */
async function stopAll(): Promise<void> {
  delete process.env.DRONE_CONFIGURATOR_MDNS

  try {
    await app?.close()
  } finally {
    relay?.close()
    advertiser?.close()
  }
}

/** Disconnects, and stops the SITL of the test. */
async function stopSitl(): Promise<void> {
  const running = sitl
  sitl = undefined

  if (await window().evaluate<boolean>(`document.querySelector('#disconnect-button') !== null`)) {
    await window().click('#disconnect-button')
    await window().waitForText('#connection', 'disconnected', CONNECT_MS)
  }
  await running?.stop()
}

/** TCP server: Connect first, then SITL starts and its SERIAL2 connects to the app's port. */
async function tcpServer(): Promise<void> {
  const port = await freePort()
  await chooseConnection(window(), { transport: 'tcp-server', host: '', port: String(port) })
  await clickConnect(window())
  sitl = await startSitl({ vehicle: 'copter', serial2: `tcpclient:127.0.0.1:${port}` })
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
}

/** UDP client, typed in: SITL sends to the relay, and the app sends to the relay's other port. */
async function udpClient(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', serial2: `udpclient:127.0.0.1:${router().sitlPort}` })
  await chooseConnection(window(), { transport: 'udp-client', host: '127.0.0.1', port: String(router().port) })
  await clickConnect(window())
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
}

/** UDP client, picked from what the network announces. */
async function found(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', serial2: `udpclient:127.0.0.1:${router().sitlPort}` })
  await openConnect(window())
  await window().click('#transport-found')
  await window().waitForText('#found-status', 'Found 1 service.', CONNECT_MS)
  expect(await window().text('#found')).toContain('SITL copter')
  await window().click('#found-connect-0')
  await window().waitForText('#connection', CONNECTED, CONNECT_MS)
}

describeSitl('more connection types and discovery against SITL', () => {
  beforeAll(startAll, TEST_MS)
  afterAll(stopAll)
  afterEach(stopSitl, CONNECT_MS)
  it('listens on TCP, and SITL connects to it', tcpServer, TEST_MS)
  it('sends to a router that listens over UDP, and SITL answers through it', udpClient, TEST_MS)
  it('finds that router on the network, and connects to SITL through it', found, TEST_MS)
}, { vehicle: 'copter', launchOnly: true })
