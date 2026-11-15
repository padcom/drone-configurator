// The map of the Flight data screen against ArduPilot SITL, in the real window (the tiles are off: no tile server is asked): the
// vehicle is on the map where SITL says it is, its home is marked a few metres from it, and when the vehicle takes off and lands
// the marker follows its height above home. Honest about what SITL's `fly` does: it arms in GUIDED, climbs to about 10 m and
// lands where it took off, so the marker's place stays within a few metres of home while its height changes (a path of several
// places is the mock's and the unit tests': the trail needs a vehicle that moves sideways). It launches its own SITL.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, and the connection. */
const STARTUP_MS = 180_000
/** The vehicle gets its position and the home is sent (every five seconds). */
const POSITION_MS = 180_000
/** Arming (pre-arm checks take up to a minute of simulated time), climbing and landing. */
const FLIGHT_MS = 420_000

let sitl: Sitl | undefined
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
 * SITL.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function vehicleOf(): Sitl {
  if (!sitl) {
    throw new Error('SITL has not started')
  }

  return sitl
}

/** What the vehicle marker and the home marker say, as the page has them. */
interface Markers {
  vehicle: { lat: number, lon: number, height: number, stale: boolean, label: string } | null
  home: { lat: number, lon: number } | null
}

/**
 * What the markers on the map say now.
 *
 * @returns the vehicle and home
 */
function markers(): Promise<Markers> {
  return window().evaluate<Markers>(`(() => {
    const vehicle = document.querySelector('.map-vehicle')
    const home = document.querySelector('.map-home')
    return {
      vehicle: vehicle && {
        lat: Number(vehicle.dataset.lat), lon: Number(vehicle.dataset.lon), height: Number(vehicle.dataset.height),
        stale: vehicle.dataset.stale === 'true', label: vehicle.getAttribute('aria-label'),
      },
      home: home && { lat: Number(home.dataset.lat), lon: Number(home.dataset.lon) },
    }
  })()`)
}

/**
 * Waits a while.
 *
 * @param ms how long
 */
const pause = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/**
 * How far apart two places are (a flat earth: good for metres).
 *
 * @param a one place
 * @param a.lat its latitude
 * @param a.lon its longitude
 * @param b the other
 * @param b.lat its latitude
 * @param b.lon its longitude
 * @returns metres
 */
function metres(a: { lat: number, lon: number }, b: { lat: number, lon: number }): number {
  const north = (b.lat - a.lat) * 111_195
  const east = (b.lon - a.lon) * 111_195 * Math.cos(a.lat * Math.PI / 180)

  return Math.hypot(north, east)
}

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter', frame: 'quad' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
}

async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

async function markersAppear(): Promise<void> {
  const both = `document.querySelector('.map-vehicle') !== null && document.querySelector('.map-home') !== null`
  await window().waitFor(both, POSITION_MS)
  const seen = await markers()

  expect(seen.vehicle?.stale).toBe(false)
  expect(seen.vehicle?.label).toContain('Vehicle at')
  // (the text of an SVG element is its textContent: it has no innerText)
  expect(await window().evaluate<string>(`document.querySelector('.map-home').textContent`)).toBe('H')
  expect(metres(seen.vehicle!, seen.home!)).toBeLessThan(15)
  // The map follows the vehicle: it is in the middle.
  const view = await window().evaluate<{ lat: number, lon: number }>(`(() => {
    const map = document.querySelector('.map')
    return { lat: Number(map.dataset.lat), lon: Number(map.dataset.lon) }
  })()`)

  expect(metres(view, seen.vehicle!)).toBeLessThan(15)
}

/**
 * Flies the vehicle (up about 10 m, and down again) and looks at its marker all the while.
 *
 * @returns the greatest height above home the marker said
 */
async function highestWhileFlying(): Promise<number> {
  const state = { flying: true, top: 0 }
  const flight = (async () => {
    try {
      await vehicleOf().fly(FLIGHT_MS)
    } finally {
      state.flying = false
    }
  })()

  while (state.flying) {
    // eslint-disable-next-line no-await-in-loop -- one look after the other, while the vehicle flies
    const seen = await markers()
    state.top = Math.max(state.top, seen.vehicle?.height ?? 0)
    // eslint-disable-next-line no-await-in-loop -- one look after the other
    await pause(500)
  }
  await flight

  return state.top
}

async function markerFollowsTheHeight(): Promise<void> {
  const home = (await markers()).home!
  const top = await highestWhileFlying()
  const after = await markers()

  expect(top).toBeGreaterThanOrEqual(5)
  expect(after.vehicle && metres(after.vehicle, home)).toBeLessThan(15)
  expect(after.home).toEqual(home)
}

describeSitl(
  'the map of the flight against ArduPilot SITL',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)

    it('has the vehicle where it is, near its home, with both marked on the map', markersAppear, POSITION_MS + 30_000)
    it('shows the height as it takes off and lands, the map staying on it', markerFollowsTheHeight, FLIGHT_MS + 60_000)
  },
  { launchOnly: true },
)
