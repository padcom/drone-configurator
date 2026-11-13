// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the
// Accelerometer and Compass pages. The vehicle's calibrations are quick; it says it is up 1.5 s after the link, and the
// backend waits for that before it sends a calibration command. The accelerometer asks for its six positions and ends with
// its own success, the level is one press, the compass reports and waits for an explicit accept (nothing is kept before), and
// a calibration that is left is cancelled. The checks go on from one another: one app, one connection.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
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
 * Opens a page of Setup from its link, and waits until the page is the one shown (a press can land beside the link while the
 * layout moves: it is made again, a few times).
 *
 * @param page the page: `accel`, `compass`, `modes`
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
 * Waits until a button can be pressed (a calibration starts only for a vehicle that is disarmed and known to be: the page
 * says why not), then presses it.
 *
 * @param id the button's id
 */
async function pressWhenEnabled(id: string): Promise<void> {
  await window().waitFor(`document.querySelector('#${id}')?.disabled === false`, 60_000)
  await window().click(`#${id}`)
}

/**
 * Waits for the result of the calibration and says how it ended.
 *
 * @returns `success`, `failed`, `cancelled` or `refused`
 */
async function outcome(): Promise<string> {
  await window().waitFor(`document.querySelector('#calibration-result') !== null`, 60_000)

  return window().evaluate<string>(`document.querySelector('#calibration-result').getAttribute('data-outcome')`)
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

/**
 * Says the vehicle is in each position from this one to the sixth, when the vehicle asks for it (the values are not shown
 * until the vehicle says it worked).
 *
 * @param position the position, 1 to 6
 */
async function placeFrom(position: number): Promise<void> {
  if (position > 6) {
    return
  }
  await window().waitFor(`document.querySelector('.setup-position[data-position="${position}"].current') !== null`, 30_000)
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-accel-values') === null`)).toBe(true)
  await pressWhenEnabled('setup-accel-placed')
  await placeFrom(position + 1)
}

it('walks through the six positions the vehicle asks for, and ends with the vehicle\'s own success', async () => {
  await openPage('accel')
  await pressWhenEnabled('setup-accel-start')

  await placeFrom(1)
  expect(await outcome()).toBe('success')
  expect(await window().evaluate<number>(`document.querySelectorAll('.setup-position.placed').length`)).toBe(6)
  expect(await window().text('#setup-accel-values')).toContain('INS_ACCOFFS_X')
  expect(await window().text('#calibration-texts')).toContain('Calibration successful')
})

it('sets the level with one press', async () => {
  await pressWhenEnabled('setup-accel-level')
  await window().waitFor(`document.querySelector('#calibration-result')?.getAttribute('data-outcome') === 'success'`, 30_000)
  await window().waitFor(`document.querySelector('#setup-accel-values') === null`, 10_000)

  expect(await window().text('#calibration-texts')).not.toContain('Calibration successful')
})

it('cancels, and says it was cancelled', async () => {
  await pressWhenEnabled('setup-accel-start')
  await window().waitFor(`document.querySelector('.setup-position[data-position="1"].current') !== null`, 30_000)
  await window().click('#setup-accel-cancel')
  await window().waitFor(`document.querySelector('#calibration-result')?.getAttribute('data-outcome') === 'cancelled'`, 30_000)

  // The page can start again once the cancel is answered.
  await window().waitFor(`document.querySelector('#setup-accel-start')?.disabled === false`, 10_000)
})

it('runs the compass to its reports and keeps nothing until the user accepts', async () => {
  await openPage('compass')
  await pressWhenEnabled('setup-compass-start')
  await window().waitFor(`document.querySelector('#setup-compass-accept') !== null`, 60_000)

  expect(await window().evaluate<number>(`document.querySelectorAll('.setup-compass').length`)).toBe(2)
  // The sphere is lit as far as the vehicle's last progress said (it sends the report, not 100 %, at the end).
  expect(await window().evaluate<string>(`document.querySelector('[data-compass="0"] .setup-sphere').getAttribute('aria-label')`))
    .toMatch(/^[1-9]\d* of 80 sections/u)
  expect(await window().text('[data-report="0"]')).toContain('Old offsets')
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-compass-kept') === null`)).toBe(true)
})

it('keeps the results when they are accepted, and offers the reboot', async () => {
  await window().click('#setup-compass-accept')
  await window().waitFor(`document.querySelector('#setup-compass-kept') !== null`, 30_000)

  expect(await outcome()).toBe('success')
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-reboot') !== null`)).toBe(true)
})

it('cancels a compass calibration when its page is left', async () => {
  await pressWhenEnabled('setup-compass-start')
  await window().waitFor(`document.querySelector('[data-compass="0"]') !== null`, 30_000)
  await openPage('modes')
  await openPage('compass')
  await window().waitFor(`document.querySelector('#calibration-result')?.getAttribute('data-outcome') === 'cancelled'`, 30_000)

  expect(await window().evaluate<boolean>(`document.querySelector('#setup-compass-accept') === null`)).toBe(true)
  await window().waitFor(`document.querySelector('#setup-compass-start')?.disabled === false`, 10_000)
})

it('moves a compass up and offers to write the new order', async () => {
  await window().waitFor(`document.querySelector('[data-place="1"]') !== null`, 30_000)
  const first = await window().text('[data-place="1"] .muted')
  await window().click('[data-place="2"] button[aria-label="Move place 2 up"]')
  await window().waitFor(`document.querySelector('[data-place="1"] .muted')?.textContent !== ${JSON.stringify(first)}`, 10_000)

  expect(await window().text('.setup-writes')).toContain('COMPASS_PRIO1_ID')
})
