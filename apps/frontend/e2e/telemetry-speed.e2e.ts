// End to end, in the real window on Linux: the telemetry's speed promise (#26). The simulated vehicle sends its position, its
// radio's channels and its outputs 50 times a second (apps/backend/e2e/tcp-vehicle.pi, VEHICLE_50HZ) and stays on the ground;
// the app is on the Flight data screen and nobody touches it. The backend coalesces what the vehicle sends: the page gets no more
// than 20 telemetry updates a second (each one is a render: the page shows every update it gets), and the page's main thread is
// busy under 5% of the time. Both are judged against apps/frontend/budgets.json, a sample a second. And the checks catch what
// they say: a second telemetry stream at 20 a second, and a busy wait put into the page on purpose, make them fail.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encodeEnvelope } from '@pico-desktop/protocol'
import { expectWithinBudget, judge } from './budgets'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

/** How many seconds are sampled for each budget. */
const SECONDS = 10

/** The subscription id of the second stream (far above any the page's own client reaches in a test). */
const SECOND_STREAM = 2_000_000

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
 * Starts the app, connected to the vehicle and on the Flight data screen, settled (the connection's own work done).
 *
 * @param vehicle the simulated vehicle
 * @returns the app
 */
async function connectedApp(vehicle: TcpVehicle): Promise<E2eApp> {
  const app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  await app.waitFor(`document.querySelector('#telemetry') !== null`)
  await sleep(3000)

  return app
}

/**
 * Counts, in the page, the telemetry events the host gives it (`window.__telemetryEvents`), without taking any from the app: its
 * own handler still gets each one first.
 */
const COUNT_TELEMETRY = `(() => {
  if (window.__telemetryEvents !== undefined) return
  const bridge = window.picoDesktop
  const previous = bridge.onmessage
  window.__telemetryEvents = 0
  bridge.onmessage = (message, live) => {
    if (previous) previous(message, live)
    const head = String.fromCharCode(...new Uint8Array(message).slice(0, 80))
    if (head.includes('telemetry.stream')) window.__telemetryEvents += 1
  }
})()`

/**
 * A page script that counts the telemetry events of each second, for `seconds`.
 *
 * @param seconds how long it counts
 * @returns the script, whose value is the counts
 */
function updatesPerSecond(seconds: number): string {
  return `new Promise(resolve => {
    const counts = []
    let before = window.__telemetryEvents
    const timer = setInterval(() => {
      counts.push(window.__telemetryEvents - before)
      before = window.__telemetryEvents
      if (counts.length === ${seconds}) {
        clearInterval(timer)
        resolve(counts)
      }
    }, 1000)
  })`
}

/** One of the page's performance metrics, as DevTools gives them. */
interface Metric {
  name: string
  value: number
}

/**
 * The page's main-thread time so far, and the clock it is read on.
 *
 * @param app the running app
 * @returns the seconds the main thread has been busy with tasks, and the time (s)
 */
async function busySoFar(app: E2eApp): Promise<{ busy: number, at: number }> {
  const { metrics } = await app.devtools('Performance.getMetrics') as { metrics: Metric[] }
  const value = (name: string) => metrics.find(metric => metric.name === name)?.value ?? 0

  return { busy: value('TaskDuration'), at: value('Timestamp') }
}

/**
 * The share of each second the page's main thread is busy (tasks: script, style, layout, paint), for `seconds`.
 *
 * @param app the running app
 * @param seconds how long it is watched
 * @returns a percent for each second
 */
async function busyPercents(app: E2eApp, seconds: number): Promise<number[]> {
  await app.devtools('Performance.enable')
  const percents: number[] = []
  let before = await busySoFar(app)
  for (let i = 0; i < seconds; i++) {
    // One second after the other.
    // eslint-disable-next-line no-await-in-loop
    await sleep(1000)
    // eslint-disable-next-line no-await-in-loop
    const now = await busySoFar(app)
    percents.push(((now.busy - before.busy) / (now.at - before.at)) * 100)
    before = now
  }

  return percents
}

/** A busy wait of 120 ms every second, put into the page on purpose (`window.__slowdown` takes it away). */
const SLOW_SECONDS = `(() => {
  const busy = ms => { const end = performance.now() + ms; while (performance.now() < end); }
  const timer = setInterval(() => busy(120), 1000)
  window.__slowdown = () => clearInterval(timer)
})()`

/**
 * Sends the backend an envelope from the page, as the page's client does.
 *
 * @param app the running app
 * @param envelope the envelope
 */
async function sendFromPage(app: E2eApp, envelope: Parameters<typeof encodeEnvelope>[0]): Promise<void> {
  const bytes = Array.from(encodeEnvelope(envelope))
  await app.evaluate(`window.picoDesktop.send(new Uint8Array(${JSON.stringify(bytes)}).buffer)`)
}

let vehicle: TcpVehicle | undefined
let app: E2eApp | undefined

/**
 * The running app.
 *
 * @returns it
 * @throws {Error} before it has started
 */
function running(): E2eApp {
  if (!app) {
    throw new Error('the app has not started')
  }

  return app
}

/** The page gets each second at most the budget's updates, and some. */
async function fewUpdates(): Promise<void> {
  const counts = await running().evaluate<number[]>(updatesPerSecond(SECONDS))

  // It does update: the vehicle's telemetry reaches the page.
  expect(Math.min(...counts)).toBeGreaterThan(0)
  expectWithinBudget('telemetryUpdates', counts)
}

/** A second stream at 20 a second, opened from the page for a moment, is over the updates budget. */
async function secondStreamIsOver(): Promise<void> {
  await sendFromPage(running(), { k: 'subscribe', id: SECOND_STREAM, n: 'telemetry.stream', p: { rateHz: 20 } })

  try {
    await sleep(1000)
    const verdict = judge('telemetryUpdates', await running().evaluate<number[]>(updatesPerSecond(3)))

    expect(verdict.ok, verdict.line).toBe(false)
  } finally {
    await sendFromPage(running(), { k: 'unsubscribe', s: SECOND_STREAM })
  }
}

/** A busy wait put into the page on purpose is over the main-thread budget. */
async function busyWaitIsOver(): Promise<void> {
  await running().evaluate(SLOW_SECONDS)

  try {
    const verdict = judge('telemetryIdleCpu', await busyPercents(running(), 5))

    expect(verdict.ok, verdict.line).toBe(false)
  } finally {
    await running().evaluate('window.__slowdown()')
  }
}

describe('telemetry from a vehicle that sends at 50 Hz, the app idle on the Flight data screen', () => {
  beforeAll(async () => {
    vehicle = await TcpVehicle.startAt50Hz()
    app = await connectedApp(vehicle)
    await app.evaluate(COUNT_TELEMETRY)
  }, 120_000)

  afterAll(async () => {
    try {
      await app?.close()
    } finally {
      vehicle?.stop()
    }
  })

  it(`gives the page no more updates a second than the budget (${SECONDS} s)`, fewUpdates, (SECONDS + 20) * 1000)

  it(`keeps the page's main thread busy less than the budget (${SECONDS} s)`, async () => {
    expectWithinBudget('telemetryIdleCpu', await busyPercents(running(), SECONDS))
  }, (SECONDS + 20) * 1000)

  it('misses the updates budget when a second stream at 20 a second is added on purpose', secondStreamIsOver, 30_000)

  it('misses the main-thread budget when a busy wait is put into the page on purpose', busyWaitIsOver, 30_000)
})
