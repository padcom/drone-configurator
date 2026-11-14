// End to end, in the real window with the real backend and the simulated vehicle behind TCP (no SITL): the live response of the
// Tune screen. The vehicle has a scripted roll rate (a square wave of 1 rad/s every 2 s as the desired rate, and a second-order
// response to it as the actual one: 16 % overshoot, 10 to 90 % in about 0.11 s). While the screen is shown the vehicle is asked
// for ATTITUDE and ATTITUDE_TARGET at 25 Hz, both lines are drawn, and the overshoot, the rise and the settling of the step are
// measured within a tolerance; when the screen is left the vehicle's rates are what they were (ATTITUDE at the telemetry's
// 4 Hz, ATTITUDE_TARGET the vehicle's own). Not covered: a real flight with a stick step (that needs ArduPilot SITL armed and
// in the air, which the SITL e2e does not do for this screen yet).
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

const ATTITUDE = 30
const ATTITUDE_TARGET = 83

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
 * The simulated vehicle.
 *
 * @returns the vehicle
 * @throws {Error} before it has started
 */
function simulated(): TcpVehicle {
  if (!vehicle) {
    throw new Error('the vehicle has not started')
  }

  return vehicle
}

/**
 * The number in the text of a metric (`16.3 %`, `110 ms`).
 *
 * @param id the element
 * @returns the number, or NaN for a dash
 */
async function metric(id: string): Promise<number> {
  return Number.parseFloat(await window().text(id))
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'tune')
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('asks the vehicle for the two rates at 25 Hz while the screen is shown, and draws both lines', async () => {
  await window().waitFor(`document.querySelectorAll('#tune-response-chart .chart-series .line').length === 2`, 60_000)

  expect(simulated().intervals.get(ATTITUDE)).toBe(40_000)
  expect(simulated().intervals.get(ATTITUDE_TARGET)).toBe(40_000)
  expect(await window().text('#tune-response-chart')).not.toContain('No data')
})

it('measures the step of the scripted vehicle: overshoot, rise and settling, within a tolerance', async () => {
  await window().waitFor(`document.querySelector('#tune-overshoot').textContent.includes('%')`, 60_000)

  // The script: a second-order response with a damping of 0.5 and 15 rad/s, sampled at 25 Hz.
  expect(await metric('#tune-overshoot')).toBeGreaterThan(8)
  expect(await metric('#tune-overshoot')).toBeLessThan(25)
  expect(await metric('#tune-rise')).toBeGreaterThan(40)
  expect(await metric('#tune-rise')).toBeLessThan(250)
  expect(await metric('#tune-settling')).toBeGreaterThan(100)
  expect(await metric('#tune-settling')).toBeLessThan(900)
  expect(await window().text('#tune-dropped')).toContain('dropped by the backend: 0')
})

it('gives the vehicle its rates back when the screen is left', async () => {
  await showScreen(window(), 'parameters')

  // ATTITUDE is the telemetry's own again (4 Hz), and ATTITUDE_TARGET is given back to the vehicle (0: its own rate)
  await vi.waitFor(() => {
    expect(simulated().intervals.get(ATTITUDE)).toBe(250_000)
    expect(simulated().intervals.get(ATTITUDE_TARGET)).toBe(0)
  }, { timeout: 15_000 })

  expect(simulated().intervals.get(ATTITUDE)).toBe(250_000)
  expect(simulated().intervals.get(ATTITUDE_TARGET)).toBe(0)
})

it('asks again when the screen is shown again', async () => {
  await showScreen(window(), 'tune')

  await window().waitFor(`document.querySelectorAll('#tune-response-chart .chart-series .line').length === 2`, 30_000)
  expect(simulated().intervals.get(ATTITUDE_TARGET)).toBe(40_000)
})
