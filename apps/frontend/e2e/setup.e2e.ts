// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the Setup screen.
// The home says what the parameters say (the compass was never calibrated: it is the next step, with what was checked), Flight
// modes names the modes of the vehicle and writes a changed slot after the one question and a read back, Failsafes says what
// each choice does, and Vehicle information shows the board. The vehicle never arms (a Setup write is refused while it is armed
// or unknown).
// The checks go on from one another: one app, one connection.
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
 * Opens a page of Setup from its list, and waits until the page is the one shown. A press through DevTools at a place read a
 * moment before the layout moved can land beside the link and do nothing (the other specs press again for that), so the press
 * is made again while the page is not the one shown, a few times.
 *
 * @param page the page: `modes`, `failsafes`, `info`, `home`
 * @param left how many presses remain
 */
async function openPage(page: string, left = 4): Promise<void> {
  const shown = `document.querySelector('a[href="#/setup/${page}"]')?.getAttribute('aria-current') === 'page'`
  await window().click(`a[href="#/setup/${page}"]`)

  try {
    await window().waitFor(shown, 5000)
  } catch (error) {
    if (left <= 1) {
      throw error
    }
    await openPage(page, left - 1)
  }
}

/**
 * Chooses a mode in a slot the way a user does: waits until the field can be used (the page says why when it cannot: the
 * vehicle armed or not known to be disarmed, the parameters still coming), presses it, waits for the list to be open, and picks
 * the option with that name (the options are written as the number and the name, so the name part is looked for, in the whole
 * page: the list is not a child of the slot's box as far as a probe is concerned).
 *
 * @param slot the slot, 1 to 6
 * @param name the mode's name in the list
 */
async function chooseMode(slot: number, name: string): Promise<void> {
  const field = `.setup-slot:nth-child(${slot}) input`
  const enabled = `document.querySelector('${field}')?.disabled === false`
  const usable = `document.querySelector('#setup-modes-blocked') === null && ${enabled}`
  await window().waitFor(usable, 60_000)
  await window().click(field)
  await window().waitFor(`document.querySelector('${field}').getAttribute('aria-expanded') === 'true'`, 10_000)
  const rows = `[...document.querySelectorAll('[role="option"]')]`
  const option = `${rows}.find(row => row.querySelector('.name')?.textContent === '${name}')`
  await window().waitFor(`${option} !== undefined`, 10_000)
  await window().evaluate(`${option}.click()`)
  await window().waitFor(`document.querySelector('${field}').value === '${name}'`, 10_000)
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

it('says what the parameters say of each step, and that the compass is the next one, with what was checked', async () => {
  await window().waitFor(`document.querySelector('#setup-progress') !== null`, 60_000)

  expect(await window().text('#setup-progress')).toBe('6 of 7 steps look set up')
  expect(await window().text('#setup-next')).toContain('Compass')
  expect(await window().evaluate<string>(`document.querySelector('.setup-card.open').textContent`))
    .toContain('COMPASS_OFS are all zero')
  expect(await window().evaluate<boolean>(`/verified|calibrated/i.test(document.querySelector('.setup-home').textContent)`))
    .toBe(false)
})

it('shows the flight modes by their names and writes a changed slot after one question, read back', async () => {
  await openPage('modes')
  await window().waitFor(`document.querySelectorAll('.setup-slot').length === 6`, 30_000)

  expect(await window().evaluate<string>(`document.querySelectorAll('.setup-slot input')[1].value`)).toBe('LOITER')
  await chooseMode(2, 'LAND')
  await window().waitFor(`document.querySelector('#setup-modes-write')?.disabled === false`, 10_000)
  await window().click('#setup-modes-write')
  await confirmWrite(window())
  await window().waitFor(`document.querySelector('#setup-modes-status')?.textContent === 'Written and read back'`, 30_000)

  expect(await window().evaluate<string>(`document.querySelectorAll('.setup-slot input')[1].value`)).toBe('LAND')
})

it('says what each failsafe does, and warns for the ground station failsafe that is off', async () => {
  await openPage('failsafes')
  await window().waitFor(`document.querySelectorAll('.setup-failsafe').length === 5`, 30_000)

  expect(await window().text('[data-failsafe="radio"] .setup-say'))
    .toBe('If the transmitter signal stops, it flies home and lands.')
  expect(await window().text('[data-failsafe="gcs"] .setup-warn')).toContain('is off')
})

it('shows the vehicle and its autopilot on the information page', async () => {
  await openPage('info')
  await window().waitFor(`document.querySelector('.setup-facts-list') !== null`, 30_000)

  expect(await window().text('.setup-facts-list')).toContain('QUADROTOR')
})

it('proposes a new voltage multiplier from a meter reading, and writes nothing until asked', async () => {
  await openPage('battery')
  await window().waitFor(`document.querySelector('[data-calibrate="voltage"] input') !== null`, 30_000)
  await window().fill('[data-calibrate="voltage"] input', '12.6')
  await window().waitFor(`document.querySelector('[data-calibrate="voltage"] .setup-proposal') !== null`, 10_000)

  expect(await window().text('[data-calibrate="voltage"] .setup-proposal')).toContain('BATT_VOLT_MULT')
  expect(await window().text('#setup-battery-write')).toBe('No changes')
})

it('lists the serial ports the vehicle has, and how many are in use', async () => {
  await openPage('serial')
  await window().waitFor(`document.querySelectorAll('.setup-port').length === 3`, 30_000)

  expect(await window().text('#setup-serial-inuse')).toBe('Ports in use: 3')
})

it('warns about the frame and draws the quad, and decodes the device ids', async () => {
  await openPage('frame')
  await window().waitFor(`document.querySelectorAll('[data-motor]').length === 4`, 30_000)

  expect(await window().text('#setup-frame-warning')).toContain('uncontrollable')
  await openPage('devices')
  await window().waitFor(`document.querySelector('[data-device="COMPASS_DEV_ID"]') !== null`, 30_000)

  expect(await window().text('[data-device="COMPASS_DEV_ID"]')).toContain('I2C')
})
