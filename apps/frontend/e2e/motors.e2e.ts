// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the Motors page.
// The outputs of the vehicle are a table that is only read (the four motors at rest), the ESC protocol is a named choice, the
// spin thresholds are written with the page's one question or not at all when they are out of order, and nothing on the page
// can send anything to a motor. The checks go on from one another: one app, one connection.
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

it('shows the four motor outputs at rest, and has no button but the parameters\' own', async () => {
  await openPage('motors')
  await window().waitFor(`document.querySelectorAll('#setup-outputs tr').length === 4`, 30_000)

  expect(await window().text('[data-output="1"]')).toContain('Output 1')
  expect(await window().text('[data-output="1"]')).toContain('1000 µs')
  const buttons = await window().evaluate<string[]>(`[...document.querySelectorAll('.setup-page-body button')].map(b => b.id)`)
  expect(buttons).toEqual(['setup-motors-revert', 'setup-motors-write'])
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
