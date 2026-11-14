// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the Motors page.
// The outputs of the vehicle are a table that is only read (the four motors at rest), the ESC protocol is a named choice, the
// spin thresholds are written with the page's one question or not at all when they are out of order, and a motor turns only while
// a button of the motor test is HELD (with the propellers said to be off), and stops when it is let go or the page is left. The
// checks go on from one another: one app, one connection.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
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
 * @param page the page: `motors`
 * @param left how many presses remain
 */
async function openPage(page: string, left = 4): Promise<void> {
  const link = `document.querySelector('a[href="#/setup/${page}"]')`
  await window().waitFor(`${link} !== null`, 120_000)

  try {
    await window().click(`a[href="#/setup/${page}"]`)
    await window().waitFor(`${link}?.getAttribute('aria-current') === 'page'`, 5000)
  } catch (error) {
    if (left <= 1) {
      throw error
    }
    await openPage(page, left - 1)
  }
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'setup')
  await app.waitFor(`document.querySelector('#setup-progress') !== null`, 120_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('shows the four motor outputs at rest, and only the parameters\' buttons and the locked ones of the motor test', async () => {
  await openPage('motors')
  await window().waitFor(`document.querySelectorAll('#setup-outputs tr').length === 4`, 30_000)

  expect(await window().text('[data-output="1"]')).toContain('Output 1')
  expect(await window().text('[data-output="1"]')).toContain('1000 µs')
  const others = `.setup-page-body button:not(.motor-test-motor)`
  const buttons = await window().evaluate<string[]>(`[...document.querySelectorAll('${others}')].map(b => b.id)`)
  expect(buttons).toEqual(['setup-motors-revert', 'setup-motors-write'])
  const locked = await window().evaluate<boolean[]>(`[...document.querySelectorAll('.motor-test-motor')].map(b => b.disabled)`)
  expect(locked).toEqual([true, true, true, true])
  expect(vehicle?.motorStarts).toBe(0)
})

it('names the ESC protocol the vehicle has', async () => {
  expect(await window().evaluate<string>(`document.querySelector('.setup-esc input').value`)).toBe('Normal')
})

it('chooses a spin threshold, and holds the write when they are out of order', async () => {
  await window().fill('[data-spin="MOT_SPIN_MAX"] input', '0.9')
  await window().waitFor(`document.querySelector('.setup-writes')?.textContent === 'MOT_SPIN_MAX'`, 10_000)
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-motors-write').disabled`)).toBe(false)

  // arm at 0.2 (the top of its range) is above min (0.15): out of order, nothing can be written until it is put right
  await window().fill('[data-spin="MOT_SPIN_ARM"] input', '0.2')
  await window().waitFor(`document.querySelector('#setup-spin-order') !== null`, 10_000)
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-motors-write').disabled`)).toBe(true)
  await window().fill('[data-spin="MOT_SPIN_ARM"] input', '0.1')
  await window().waitFor(`document.querySelector('#setup-spin-order') === null`, 10_000)
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-motors-write').disabled`)).toBe(false)
  expect(vehicle?.writes).toBe(0)
})

/**
 * A pointer event on a button of the motor test, as the browser sends it.
 *
 * @param letter the motor's letter
 * @param type the event
 */
async function pointer(letter: string, type: 'pointerdown' | 'pointerup'): Promise<void> {
  const button = `document.querySelector('[data-motor="${letter}"]')`
  const event = `new PointerEvent('${type}', { button: 0, isPrimary: true, bubbles: true })`
  await window().evaluate(`${button}.dispatchEvent(${event})`)
}

/**
 * How many tests of a motor the vehicle was told to begin.
 *
 * @returns the count
 */
function started(): number {
  return vehicle?.motorStarts ?? 0
}

/**
 * How many times the vehicle was told to stop a motor.
 *
 * @returns the count
 */
function stopped(): number {
  return vehicle?.motorStops ?? 0
}

it('spins a motor only while its button is held, with the propellers off, and stops it when it is let go', async () => {
  // the buttons are locked: a press on one does nothing
  await pointer('A', 'pointerdown')
  await pointer('A', 'pointerup')
  expect(started()).toBe(0)

  await window().click('.kit-tick input')
  await window().waitFor(`document.querySelector('[data-motor="A"]').disabled === false`, 10_000)
  await pointer('A', 'pointerdown')
  await vi.waitFor(() => expect(started()).toBeGreaterThan(0), { timeout: 15_000 })
  expect(await window().text('#setup-motor-test-status')).toContain('Motor A is running')
  const stops = stopped()
  await pointer('A', 'pointerup')

  await vi.waitFor(() => expect(stopped()).toBeGreaterThan(stops), { timeout: 15_000 })
  const status = `document.querySelector('#setup-motor-test-status').textContent`
  await window().waitFor(`${status}.includes('Motor A stopped')`, 10_000)
})

it('stops the motor when the page is left while its button is held', async () => {
  // (the vehicle needs a moment after a test before the next)
  await window().waitFor(`document.querySelector('[data-motor="B"]').disabled === false`, 15_000)
  const starts = started()
  await pointer('B', 'pointerdown')
  await vi.waitFor(() => expect(started()).toBeGreaterThan(starts), { timeout: 15_000 })
  const stops = stopped()
  await openPage('radio')

  await vi.waitFor(() => expect(stopped()).toBeGreaterThan(stops), { timeout: 15_000 })
})

it('stops the motor with a stop the vehicle receives when the window is closed while its button is held', async () => {
  await openPage('motors')
  await window().click('.kit-tick input')
  await window().waitFor(`document.querySelector('[data-motor="C"]').disabled === false`, 20_000)
  const starts = started()
  await pointer('C', 'pointerdown')
  await vi.waitFor(() => expect(started()).toBeGreaterThan(starts), { timeout: 15_000 })
  const stops = stopped()
  // the window closes with the button down: the host tells the backend, which ends the session (and the stop goes out first)
  const closing = window()
  app = undefined
  await closing.close()

  // an explicit stop (a timeout of 0), not the vehicle's own 1.5 s running out
  await vi.waitFor(() => expect(stopped()).toBeGreaterThan(stops), { timeout: 15_000 })
})
