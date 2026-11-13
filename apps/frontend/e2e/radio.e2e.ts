// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the Radio page. The
// vehicle's sticks keep moving (roll and pitch sweep their range, the yaw stick sends a pulse that is not a reading every few
// steps), it says it is up 1.5 s after the link, and the backend waits for that before it sets the RC calibration flag. The bars
// follow the channels, a calibration that is cancelled or whose page is left chooses nothing, and one the user ends with Done
// chooses the ranges (not written) for the page's one write. The checks go on from one another: one app, one connection.
import { setTimeout as sleep } from 'node:timers/promises'
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
 * @param page the page: `radio`, `modes`
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

/**
 * Waits until a button can be pressed (a calibration starts only for a vehicle that is disarmed and known to be), then
 * presses it.
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

/**
 * What the page shows for the pulse of a channel.
 *
 * @param channel the channel, 1 based
 * @returns the text, such as `1500 µs`
 */
function pulseOf(channel: number): Promise<string> {
  return window().text(`[data-channel="${channel}"] .setup-channel-pulse`)
}

/**
 * Looks at the roll and the yaw channels `times` times, 150 ms apart.
 *
 * @param times how many looks remain
 * @param seen the roll pulses seen so far
 * @returns the different roll pulses seen, and whether the yaw channel ever showed the spike
 */
async function watchSticks(times: number, seen: Set<string> = new Set()): Promise<{ roll: Set<string>, spiked: boolean }> {
  if (times === 0) {
    return { roll: seen, spiked: false }
  }
  seen.add(await pulseOf(1))
  const spike = (await pulseOf(4)).includes('9000')
  await sleep(150)
  const rest = await watchSticks(times - 1, seen)

  return { roll: rest.roll, spiked: spike || rest.spiked }
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

it('shows a bar for every channel that follows the sticks and never shows a pulse that is not a reading', async () => {
  await openPage('radio')
  await window().waitFor(`document.querySelectorAll('.setup-channel-row').length === 8`, 30_000)

  expect(await window().text('[data-channel="1"] .setup-channel-name')).toBe('Channel 1 · Roll')
  expect(await window().text('[data-channel="3"] .setup-channel-name')).toBe('Channel 3 · Throttle')
  expect(await window().text('[data-channel="5"] .setup-channel-name')).toBe('Channel 5')
  // roll sweeps: more than one value is seen; the yaw stick's spike (9000 µs) is never shown as a pulse
  const seen = await watchSticks(24)
  expect(seen.roll.size).toBeGreaterThan(1)
  expect(seen.spiked).toBe(false)
  // the function of channel 7 is a number with no name here (no metadata is loaded): it is shown as the number
  expect(await window().evaluate<string>(`document.querySelector('[data-aux="7"] input').value`)).toBe('4')
})

it('cancels, chooses nothing, and can start again', async () => {
  await pressWhenEnabled('setup-radio-start')
  await window().waitFor(`document.querySelector('#setup-radio-finish')?.disabled === false`, 60_000)
  await window().click('#setup-radio-cancel')

  expect(await outcome()).toBe('cancelled')
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-radio-staged') === null`)).toBe(true)
  expect(await window().evaluate<number>(`document.querySelectorAll('.setup-writes li').length`)).toBe(0)
  await window().waitFor(`document.querySelector('#setup-radio-start')?.disabled === false`, 10_000)
})

it('cancels a calibration when its page is left', async () => {
  await pressWhenEnabled('setup-radio-start')
  await window().waitFor(`document.querySelector('#setup-radio-finish')?.disabled === false`, 60_000)
  await openPage('modes')
  await openPage('radio')
  await window().waitFor(`document.querySelector('#calibration-result')?.getAttribute('data-outcome') === 'cancelled'`, 30_000)

  await window().waitFor(`document.querySelector('#setup-radio-start')?.disabled === false`, 10_000)
  expect(await window().evaluate<number>(`document.querySelectorAll('.setup-writes li').length`)).toBe(0)
})

it('ends only when the user says so, and then chooses the ranges of the sticks that moved (and writes nothing)', async () => {
  await pressWhenEnabled('setup-radio-start')
  await window().waitFor(`document.querySelector('#setup-radio-finish')?.disabled === false`, 60_000)
  // the yaw stick's spikes are counted and kept out
  await window().waitFor(`document.querySelector('#setup-radio-glitches') !== null`, 30_000)
  // the calibration has not ended by itself: nothing is chosen yet
  expect(await window().evaluate<number>(`document.querySelectorAll('.setup-writes li').length`)).toBe(0)
  await window().click('#setup-radio-finish')

  expect(await outcome()).toBe('success')
  await window().waitFor(`document.querySelector('#setup-radio-staged') !== null`, 10_000)
  const writes = await window().text('.setup-writes')
  expect(writes).toContain('RC1_MIN')
  expect(writes).toContain('RC2_MAX')
  expect(writes).toContain('RC1_TRIM')
  // the yaw stick never moved but for the spikes, which are not readings: no range for it
  expect(writes).not.toContain('RC4_')
  expect(await window().evaluate<boolean>(`document.querySelector('#setup-radio-write')?.disabled === false`)).toBe(true)
  expect(vehicle?.writes).toBe(0)
})
