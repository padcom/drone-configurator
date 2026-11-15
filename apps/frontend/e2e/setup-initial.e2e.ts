// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the Setup page
// "Initial tune". The user says the propeller size and the cells; the table shows what each parameter is now and the value
// Mission Planner's calculation suggests (or why there is none); "Use these values" only chooses them, and the one question
// writes them, each read back by the vehicle. The vehicle has no ATC_RAT_YAW_FLTE and the page says so.
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
  await window().waitFor(`document.querySelector('#setup-initial-table') !== null`, 30_000)

  expect(await cell('INS_GYRO_FILTER', 3)).toBe('say the propeller size')
  expect(await cell('MOT_BAT_VOLT_MAX', 3)).toBe('say the cells')
  expect(await cell('INS_ACCEL_FILTER', 3)).toBe('10')
})

it('says that a parameter is not on this vehicle, and suggests the values of 5 inch propellers and 3 cells', async () => {
  await window().fill('#setup-initial-size', '5')
  await window().fill('#setup-initial-cells', '3')
  await window().waitFor(`document.querySelector('[data-param="MOT_BAT_VOLT_MAX"] td:last-child').textContent === '12.6'`, 10_000)

  expect(await cell('ATC_RAT_YAW_FLTE', 3)).toBe('not on this vehicle')
  expect(await cell('INS_GYRO_FILTER', 3)).toBe('75')
  expect(await cell('ATC_ACC_P_MAX', 3)).toBe('1686')
})

it('suggests the values of 10 inch propellers and 4 cells, beside what the vehicle has now', async () => {
  await window().fill('#setup-initial-size', '10')
  await window().fill('#setup-initial-cells', '4')
  await window().waitFor(`document.querySelector('[data-param="MOT_BAT_VOLT_MAX"] td:last-child').textContent === '16.8'`, 10_000)

  expect(await cell('INS_GYRO_FILTER', 2)).toBe('20')
  expect(await cell('INS_GYRO_FILTER', 3)).toBe('42')
  expect(await cell('ATC_RAT_RLL_FLTD', 3)).toBe('21')
  expect(await cell('ATC_ACC_P_MAX', 3)).toBe('1167')
  expect(await cell('MOT_THST_EXPO', 3)).toBe('0.6')
  expect(await cell('MOT_BAT_VOLT_MIN', 3)).toBe('13.2')
  expect(await cell('BATT_LOW_VOLT', 3)).toBe('14.4')
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

  // fifteen suggestions, one for each parameter the vehicle has (the thirteen it was given for this page, and BATT_CRT_VOLT and
  // BATT_LOW_VOLT, which the simulated vehicle has already); every one was sent and read back
  expect(simulated().writes).toBe(before + 15)
  expect(await cell('INS_GYRO_FILTER', 2)).toBe('42')
  expect(await cell('MOT_BAT_VOLT_MAX', 2)).toBe('16.8')
})
