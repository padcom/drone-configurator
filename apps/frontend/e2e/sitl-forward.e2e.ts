// Forwarding MAVLink to another program (#34), against ArduPilot SITL in the real window: Settings, Forward MAVLink, a UDP
// program (a second ground station of this test) is added, the app connects to SITL, and the second station reads parameters
// from SITL through the forward: the whole list, then one by name (its requests go through the app to the vehicle, the answers
// come back). The app's own parameter download goes on as before, and gives the same count. It launches its own SITL, so it
// ignores SITL_ENDPOINT. The same without SITL, in CI on every change: forward.e2e.ts.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { ForwardStation } from './forward-station'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL's vehicle: system 1, the autopilot. */
const VEHICLE = { systemId: 1, componentId: 1 }
/** How long a connection, a read by name or the app's download may take. */
const WAIT_MS = 45_000
/** How long the whole list through the forward may take (about a thousand parameters, asked again for what goes missing). */
const LIST_MS = 120_000

// What the run has started (undefined until it has).
let sitl: Sitl | undefined
let app: E2eApp | undefined
let station: ForwardStation | undefined

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
 * The second station.
 *
 * @returns the station
 * @throws {Error} before it has started
 */
function second(): ForwardStation {
  if (!station) {
    throw new Error('the station has not started')
  }

  return station
}

/** Starts SITL, the second station and the app; adds the station to the forwarding, and connects to SITL. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  station = await ForwardStation.open()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('.settings-forward') !== null`, 60_000)
  await app.fill('.forward-add select', 'udp')
  await app.fill('.forward-host input', '127.0.0.1')
  await app.fill('.forward-port input', String(station.port))
  await app.click('#forward-add')
  await app.waitFor(`document.querySelector('.forward-row[data-key="udp:127.0.0.1:${station.port}"]') !== null`, WAIT_MS)
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', WAIT_MS)
}

/** Stops what was started: the SITL also when the app does not close. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    station?.close()
    await sitl?.stop()
  }
}

/** The count the second station read, for the check of the app's own download. */
let listed = 0

async function readsTheWholeList(): Promise<void> {
  await second().waitForHeartbeat(VEHICLE.systemId, WAIT_MS)
  listed = await second().readList(VEHICLE, LIST_MS)
  expect(listed).toBeGreaterThanOrEqual(300)
  expect(second().params.size).toBeGreaterThanOrEqual(listed)
}

async function readsOneByName(): Promise<void> {
  // One the list had (the names change between ArduPilot's versions), asked for by its name, with the value the list gave.
  const one = [...second().params.values()].find(p => p.index === 100)
  expect(one).toBeDefined()
  const { name, value } = one!
  expect(await second().readParam(VEHICLE, name, WAIT_MS)).toBe(value)
}

async function theAppGoesOn(): Promise<void> {
  await showScreen(window(), 'parameters')
  const status = await window().waitForText('#list-status', /^\d+ parameters$/u, WAIT_MS)
  expect(Number.parseInt(status, 10)).toBe(listed)

  await showScreen(window(), 'settings')
  const row = `.forward-row[data-key="udp:127.0.0.1:${second().port}"]`
  await window().waitForText(`${row} .forward-state`, /^(?:Up|Dropping: too slow)$/u, WAIT_MS)
  await window().waitForText(`${row} .forward-counts`, /^Sent [1-9]/u, WAIT_MS)
}

describeSitl('forwarding MAVLink to a second station against ArduPilot SITL', () => {
  beforeAll(startAll, 180_000)
  afterAll(stopAll)

  it('lets a second station read the whole list through the forward', readsTheWholeList, LIST_MS + WAIT_MS)
  it('lets a second station read a parameter by name through the forward', readsOneByName, 2 * WAIT_MS)
  it('keeps the app\'s own download going, with the same count, and counts what was sent', theAppGoesOn, 3 * WAIT_MS)
}, { launchOnly: true })
