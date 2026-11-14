// End to end, in the real window with the real backend and the simulated vehicle behind TCP (no SITL): the Tune screen. The rate
// loop's sliders have the name of each parameter and "was X", roll and pitch are written together after ONE question that names
// both and each is read back, and a value beyond the hard limit of ArduPilot's table is refused and nothing reaches the vehicle.
// The vehicle never arms here: the armed case (a hold, the banner) is the backend's tests (tuning.test.pi) and the screen's
// (Tune.test.ts).
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

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

it('shows the rate sliders with their parameters\' names and what they were, roll and pitch as one', async () => {
  await window().waitFor(`document.querySelector('[data-tune="ATC_RAT_RLL_P"]') !== null`, 120_000)

  expect(await window().text('[data-tune="ATC_RAT_RLL_P"] .tune-names')).toBe('ATC_RAT_RLL_P + ATC_RAT_PIT_P')
  expect(await window().text('[data-tune="ATC_RAT_RLL_P"] .tune-was')).toBe('was 0.135')
  expect(await window().text('[data-tune="ATC_RAT_YAW_P"] .tune-names')).toBe('ATC_RAT_YAW_P')
})

it('refuses a value above the most of the table: it says so, and nothing is sent to the vehicle', async () => {
  const sent = vehicle?.writes
  await window().fill('[data-tune="ATC_RAT_YAW_P"] input[type="text"]', '2.6')
  await window().waitFor(`document.querySelector('[data-tune="ATC_RAT_YAW_P"] .tune-note.problem') !== null`, 10_000)

  expect(await window().text('[data-tune="ATC_RAT_YAW_P"] .tune-note')).toContain('refused')
  expect(await window().evaluate<boolean>(`document.querySelector('#tune-rate-write').disabled`)).toBe(true)
  expect(vehicle?.writes).toBe(sent)
  // back to what it was: nothing is left to write
  await window().fill('[data-tune="ATC_RAT_YAW_P"] input[type="text"]', '0.18')
  await window().waitFor(`document.querySelector('#tune-rate-write').disabled === true`, 10_000)
})

it('writes roll and pitch together after one question, each read back by the vehicle', async () => {
  const before = vehicle?.writes ?? 0
  await window().fill('[data-tune="ATC_RAT_RLL_P"] input[type="text"]', '0.2')
  await window().waitFor(`document.querySelector('#tune-rate-write')?.disabled === false`, 10_000)
  expect(await window().text('.setup-writes')).toContain('ATC_RAT_RLL_P')
  await window().click('#tune-rate-write')
  const question = await window().text('#confirm')
  expect(question).toContain('ATC_RAT_RLL_P')
  expect(question).toContain('ATC_RAT_PIT_P')
  await confirmWrite(window())
  await window().waitFor(`document.querySelector('#tune-rate-status')?.textContent === 'Written and read back'`, 30_000)

  // one PARAM_SET for each of the two, and the value the vehicle reads back is shown
  expect(vehicle?.writes).toBe(before + 2)
  const shown = `document.querySelector('[data-tune="ATC_RAT_RLL_P"] input[type="text"]').value`
  expect(await window().evaluate<string>(shown)).toBe('0.2')
})

it('says the filters come after the logs', async () => {
  await window().evaluate(`location.hash = '#/tune/filters'`)
  await window().waitFor(`document.body.textContent.includes('Filters come after the logs')`, 10_000)
})
