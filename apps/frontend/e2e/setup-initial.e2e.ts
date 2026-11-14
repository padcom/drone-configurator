// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the Setup page
// "Initial tune". The user chooses a propeller size and says the cells; the table shows what each parameter is now and the value
// ArduPilot's page suggests (or why there is none); "Use these values" only chooses them, and the one question writes them, each
// read back by the vehicle. The vehicle has no ATC_RAT_YAW_FLTE and the page says so; for 5 inch the page gives no acceleration.
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
 * The text of one cell of the table.
 *
 * @param id the parameter
 * @param column 2 for what the vehicle has now, 3 for the suggestion
 * @returns the text
 */
function cell(id: string, column: 2 | 3): Promise<string> {
  return window().text(`[data-param="${id}"] td:nth-child(${column})`)
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'setup')
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('shows no values before a size is chosen', async () => {
  // The Setup home has the step cards, not the list of pages: a page is opened from a card, and the list is there from then on.
  await window().waitFor(`document.querySelector('a[href="#/setup/battery"]') !== null`, 60_000)
  await window().click('a[href="#/setup/battery"]')
  await window().waitFor(`document.querySelector('.setup-nav a[href="#/setup/initial"]') !== null`, 30_000)
  await window().click('.setup-nav a[href="#/setup/initial"]')
  await window().waitFor(`document.querySelector('#setup-initial-pick') !== null`, 30_000)

  expect(await window().evaluate<boolean>(`document.querySelector('#setup-initial-table') === null`)).toBe(true)
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-initial-use').disabled`)).toBe(true)
})

it('says for 5 inch that the page gives no acceleration, and that a parameter is not on this vehicle', async () => {
  await window().click('#setup-initial-size-5')
  await window().waitFor(`document.querySelector('#setup-initial-table') !== null`, 10_000)

  expect(await cell('ATC_ACC_P_MAX', 3)).toBe('not given by ArduPilot\'s page for this size')
  expect(await cell('ATC_RAT_YAW_FLTE', 3)).toBe('not on this vehicle')
  expect(await cell('INS_GYRO_FILTER', 3)).toBe('80')
})

it('suggests the values of 10 inch propellers and 4 cells, beside what the vehicle has now', async () => {
  await window().click('#setup-initial-size-10')
  await window().fill('input[type="text"]', '4')
  await window().waitFor(`document.querySelector('[data-param="MOT_BAT_VOLT_MAX"] td:last-child').textContent === '16.8'`, 10_000)

  expect(await cell('INS_GYRO_FILTER', 2)).toBe('20')
  expect(await cell('INS_GYRO_FILTER', 3)).toBe('40')
  expect(await cell('ATC_RAT_RLL_FLTD', 3)).toBe('20')
  expect(await cell('ATC_ACC_P_MAX', 3)).toBe('1100')
  expect(await cell('MOT_THST_EXPO', 3)).toBe('0.65')
  expect(await cell('MOT_BAT_VOLT_MIN', 3)).toBe('13.2')
})

it('only chooses the values when asked, then writes them after one question, each read back', async () => {
  const before = simulated().writes
  await window().click('#setup-initial-use')
  await window().waitFor(`document.querySelector('#setup-initial-write')?.disabled === false`, 10_000)

  expect(simulated().writes).toBe(before)
  expect(await window().text('.setup-writes')).toContain('INS_GYRO_FILTER')
  expect(await window().text('.setup-writes')).not.toContain('ATC_RAT_YAW_FLTE')
  await window().click('#setup-initial-write')
  await confirmWrite(window())
  await window().waitFor(`document.querySelector('#setup-initial-status')?.textContent === 'Written and read back'`, 60_000)

  // thirteen suggestions, one for each parameter the vehicle has; every one was sent and read back
  expect(simulated().writes).toBe(before + 13)
  expect(await cell('INS_GYRO_FILTER', 2)).toBe('40')
  expect(await cell('MOT_BAT_VOLT_MAX', 2)).toBe('16.8')
})
