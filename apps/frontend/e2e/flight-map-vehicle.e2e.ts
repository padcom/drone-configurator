// End to end, in the real window with the real backend and a SCRIPTED vehicle (e2e/scripted-vehicle.ts: it sends the position,
// the home and the heartbeat a test tells it to; the tiles are off, so no tile server is asked): what the map draws of it.
// The marker with its heading and home appear; the vehicle is marked old, with "last heard", when it falls silent; a position at
// (0, 0) is not drawn; the path grows as the vehicle moves, stays when the link is cut and the same vehicle comes back, and
// starts again when it is armed and when another vehicle (another system id) connects; the map follows the vehicle until it is
// dragged, moved with an arrow key or zoomed with the wheel, and the centre button takes it back to the vehicle.
// The checks go on from one another (one app, one connection).
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { ScriptedVehicle } from './scripted-vehicle'

let vehicle: ScriptedVehicle | undefined
let app: E2eApp | undefined

const START = { lat: 47.397742, lon: 8.545594 }

/**
 * Where the vehicle says it is after some steps north (one step is about 11 m), heading east.
 *
 * @param steps how many
 * @returns the position
 */
function northBy(steps: number): { lat: number, lon: number, heading: number, height: number } {
  return { lat: START.lat + steps * 0.0001, lon: START.lon, heading: 90, height: 0 }
}

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
 * The scripted vehicle.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function scripted(): ScriptedVehicle {
  if (!vehicle) {
    throw new Error('the vehicle has not started')
  }

  return vehicle
}

beforeAll(async () => {
  vehicle = await ScriptedVehicle.start()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

/** What the vehicle marker says. */
interface Marker {
  lat: number
  heading: string
  stale: string
  label: string
}

/**
 * What the vehicle marker says, or null when there is none.
 *
 * @returns the data of the marker
 */
function marker(): Promise<Marker | null> {
  return window().evaluate(`(() => {
    const m = document.querySelector('.map-vehicle')
    if (!m) return null
    return { lat: Number(m.dataset.lat), heading: m.dataset.heading, stale: m.dataset.stale, label: m.getAttribute('aria-label') }
  })()`)
}

/**
 * How many points the path has.
 *
 * @returns the count
 */
function pathLength(): Promise<number> {
  return window().evaluate<number>(`(() => {
    const line = document.querySelector('.map-trail')
    return line ? line.getAttribute('points').split(' ').length : 0
  })()`)
}

/**
 * Whether the map follows the vehicle (the follow button is pressed).
 *
 * @returns true when it does
 */
function following(): Promise<boolean> {
  return window().evaluate<boolean>(`document.querySelector('#map-follow').getAttribute('aria-pressed') === 'true'`)
}

/**
 * Waits until the marker is, or is not, marked as old.
 *
 * @param stale whether it is to be old
 * @param timeoutMs how long to wait
 * @returns nothing: it is done when the wait is over
 */
function waitForStale(stale: boolean, timeoutMs = 20_000): Promise<void> {
  return window().waitFor(`document.querySelector('.map-vehicle')?.dataset.stale === '${stale}'`, timeoutMs)
}

/**
 * Makes the vehicle go north by a step at a time, so that the path grows.
 *
 * @param first the number of the first step
 * @param steps how many
 */
async function flyNorth(first: number, steps: number): Promise<void> {
  for (let step = first; step < first + steps; step += 1) {
    scripted().position(northBy(step))
    // eslint-disable-next-line no-await-in-loop -- one step after the other, a little apart
    await new Promise<void>(resolve => {
      setTimeout(resolve, 450)
    })
  }
}

/**
 * Drags the map with the mouse a few pixels, as the host sends it (real pointer events).
 *
 * @param from where the pointer goes down
 * @param from.x the column
 * @param from.y the row
 */
async function dragMap(from: { x: number, y: number }): Promise<void> {
  const mouse = (type: string, x: number, buttons: number) => window().devtools('Input.dispatchMouseEvent', {
    type, x, y: from.y, button: 'left', buttons, clickCount: 1,
  })
  await mouse('mousePressed', from.x, 1)
  await mouse('mouseMoved', from.x + 80, 1)
  await mouse('mouseReleased', from.x + 80, 0)
}

/**
 * Sends an event to the map, as the page gets it.
 *
 * @param event the JavaScript that makes the event
 */
async function sendToMap(event: string): Promise<void> {
  await window().evaluate(`document.querySelector('.map').dispatchEvent(${event})`)
}

it('marks the vehicle with its heading, and home with an H, on the map that follows it', async () => {
  scripted().home(START)
  scripted().position(northBy(0))
  const both = `document.querySelector('.map-vehicle') !== null && document.querySelector('.map-home') !== null`
  await window().waitFor(both, 60_000)
  const seen = await marker()

  expect(seen?.heading).toBe('90')
  expect(seen?.stale).toBe('false')
  expect(seen?.label).toContain('heading 90 degrees')
  expect(await window().evaluate<string>(`document.querySelector('.map-home').textContent`)).toBe('H')
  expect(await following()).toBe(true)
  expect(await window().evaluate<number>(`Number(document.querySelector('.map').dataset.lat)`)).toBeCloseTo(START.lat, 3)
})

it('marks the vehicle as old, with when it was last heard, when it falls silent, and fresh when it speaks again', async () => {
  scripted().silence(true)
  await waitForStale(true)

  expect((await marker())?.label).toContain('last heard')
  expect(await window().evaluate<string>(`document.querySelector('.map-stale-label').textContent`)).toContain('last heard')
  scripted().silence(false)
  await waitForStale(false)
})

it('does not draw the vehicle at (0, 0): a vehicle with no position stays where it was last heard, as old', async () => {
  scripted().position({ lat: 0, lon: 0, heading: 0, height: 0 })
  await waitForStale(true)

  expect((await marker())?.lat).toBeCloseTo(START.lat, 3)
  scripted().position(northBy(0))
  await waitForStale(false)
})

it('draws the path as the vehicle moves', async () => {
  await flyNorth(1, 5)
  await vi.waitFor(async () => expect(await pathLength()).toBeGreaterThanOrEqual(4), { timeout: 20_000 })
})

it('keeps the path when the link is cut and the same vehicle comes back, the marker old in between', async () => {
  const before = await pathLength()
  // (it says nothing of its position from the moment the link is cut: the same vehicle comes back with a link and no position)
  scripted().silence(true)
  scripted().cut()
  await waitForStale(true, 30_000)

  expect(await pathLength()).toBeGreaterThanOrEqual(before)
  await window().waitForText('#connection', 'connected · system', 90_000)
  expect((await marker())?.stale).toBe('true')
  expect(await pathLength()).toBeGreaterThanOrEqual(before)
  scripted().silence(false)
  await waitForStale(false, 60_000)

  expect(await pathLength()).toBeGreaterThanOrEqual(before)
})

it('starts the path again when the vehicle is armed', async () => {
  expect(await pathLength()).toBeGreaterThanOrEqual(4)
  scripted().arm(true)
  await vi.waitFor(async () => expect(await pathLength()).toBeLessThanOrEqual(1), { timeout: 20_000 })
  scripted().arm(false)
})

it('starts the path again when another vehicle connects', async () => {
  await flyNorth(6, 5)
  await vi.waitFor(async () => expect(await pathLength()).toBeGreaterThanOrEqual(3), { timeout: 20_000 })
  scripted().setSysid(2)
  scripted().cut()
  await window().waitForText('#connection', 'system 2', 90_000)

  await vi.waitFor(async () => expect(await pathLength()).toBeLessThanOrEqual(1), { timeout: 20_000 })
})

it('follows the vehicle until the map is dragged, moved with an arrow key or zoomed, and the centre button resumes', async () => {
  const arrow = `new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })`
  const wheel = `new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })`
  const box = await window().evaluate<{ x: number, y: number }>(`(() => {
    const rect = document.querySelector('.map').getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  })()`)
  await window().click('#map-centre')

  expect(await following()).toBe(true)
  await dragMap(box)
  await vi.waitFor(async () => expect(await following()).toBe(false), { timeout: 10_000 })
  await window().click('#map-centre')
  await sendToMap(arrow)
  await vi.waitFor(async () => expect(await following()).toBe(false), { timeout: 10_000 })
  await window().click('#map-centre')
  await sendToMap(wheel)
  await vi.waitFor(async () => expect(await following()).toBe(false), { timeout: 10_000 })
})

it('has the vehicle in the middle of the map again when the centre button is pressed', async () => {
  await window().click('#map-centre')
  await vi.waitFor(async () => {
    const view = await window().evaluate<number>(`Number(document.querySelector('.map').dataset.lat)`)
    const mark = (await marker())?.lat ?? 0

    expect(Math.abs(view - mark)).toBeLessThan(0.0005)
  }, { timeout: 10_000 })
})
