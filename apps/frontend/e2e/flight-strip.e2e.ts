// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the controls of a
// flight under the map. The vehicle starts disarmed (it never arms by itself here). "Review and arm" opens the review (what the
// vehicle says of its checks, in its words), "Arm…" asks for a HOLD, and the strip says armed only when the vehicle's heartbeat
// does. A hold of "Disarm" disarms; the emergency stop is under "More", only while armed, and is a red hold. The strip fits the
// column. What the real autopilot does with these commands is sitl-arming.e2e.ts.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

let vehicle: TcpVehicle | undefined
let app: E2eApp | undefined

/** How long a confirmation ignores presses (400 ms) with a margin, and how long a hold takes (1200 ms) with one. */
const ARMS_MS = 600
const HOLD_MS = 1500

/** Selectors of what the tests look at. */
const REVIEW = '[data-command-button="vehicle.review"]'
const DISARM = '[data-command-button="vehicle.disarm"]'
const MORE = '#flight-strip .kit-menu'
const STOP = '#flight-strip [role="menuitem"]'
const ARM_BUTTON = '#review-arm'

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
 * Waits.
 *
 * @param ms for how long
 */
const sleep = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/**
 * Whether something is on the page.
 *
 * @param selector what to look for
 * @returns true when it is
 */
function exists(selector: string): Promise<boolean> {
  return window().evaluate<boolean>(`document.querySelector(${JSON.stringify(selector)}) !== null`)
}

/**
 * Waits until something is on the page.
 *
 * @param selector what to wait for
 * @param ms for how long at most
 * @returns once it is there
 */
function appears(selector: string, ms = 10_000): Promise<void> {
  return window().waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`, ms)
}

/**
 * Waits until the strip says a state (what the vehicle's heartbeat says).
 *
 * @param word `Armed` or `Disarmed`
 * @returns once it does
 */
function stripSays(word: string): Promise<void> {
  return window().waitFor(`document.querySelector('#strip-state')?.innerText.includes('${word}')`, 30_000)
}

/** Waits until the review can be used to arm: the vehicle has run its checks and the arm may be asked for. */
async function reviewIsReady(): Promise<void> {
  await window().waitFor(`document.querySelector('#review-running') === null`)
  await window().waitFor(`document.querySelector('${ARM_BUTTON}') !== null && !document.querySelector('${ARM_BUTTON}').disabled`)
}

/**
 * What the page says of a hold that did not come: the dialogs and the notices (a toast says why a command did not run).
 *
 * @returns their words
 */
function notices(): Promise<string> {
  return window().evaluate<string>(
    `[...document.querySelectorAll('[role="status"], [role="alert"], dialog')].map(e => e.id + ': ' + e.innerText).join(' | ')`,
  )
}

/** Holds the confirm button of the question that is open, long enough, as a person does with the pointer. */
async function hold(): Promise<void> {
  try {
    await appears('#confirm-hold')
  } catch (error) {
    throw new Error(`no hold was asked for; the page says: ${await notices()}`, { cause: error })
  }
  // (the question ignores presses for its first moments)
  await sleep(ARMS_MS)
  await window().evaluate(`document.querySelector('#confirm-hold')
    .dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, pointerId: 1 }))`)
  await sleep(HOLD_MS)
  await window().waitFor(`document.querySelector('#confirm') === null`)
}

/** Reviews, and asks for the hold to arm, and holds. */
async function armWithTheHold(): Promise<void> {
  await window().click(REVIEW)
  await appears('#review-state')
  await reviewIsReady()
  await window().click(ARM_BUTTON)
  await hold()
  await stripSays('Armed')
}

beforeAll(async () => {
  // The Setup vehicle: it never arms by itself.
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'flight')
  // (an arm is not offered while the parameters are being downloaded)
  const listed = `document.body.innerText.includes('Parameters: ') && !document.body.innerText.includes('Downloading')`
  await app.waitFor(listed, 60_000)
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('says disarmed, offers the review and no disarm or stop, and lists the modes of the vehicle', async () => {
  await stripSays('Disarmed')

  expect(await window().text(REVIEW)).toBe('Review and arm')
  expect(await exists(DISARM)).toBe(false)
  expect(await exists(MORE)).toBe(false)
  await window().waitFor(`document.querySelectorAll('#strip-mode option').length > 5`, 30_000)
  const modes = await window().evaluate<string[]>(`[...document.querySelectorAll('#strip-mode option')].map(o => o.textContent)`)

  expect(modes).toContain('RTL')
})

it('fits its column: nothing in the strip is wider than the strip, and the page does not scroll sideways', async () => {
  const fits = await window().evaluate<boolean>(`(() => {
    const strip = document.querySelector('#flight-strip')
    const page = document.documentElement
    return strip.scrollWidth <= strip.clientWidth + 1 && page.scrollWidth <= page.clientWidth + 1
  })()`)

  expect(fits).toBe(true)
})

it('reviews, asks for a hold to arm, and says armed only when the vehicle does', async () => {
  await window().click(REVIEW)
  await appears('#review-state')

  // (the simulated vehicle says nothing of its checks: the review says so, and does not guess)
  expect(await window().text('#review-state')).toBe('The vehicle does not say whether its checks pass.')
  await reviewIsReady()
  await window().click(ARM_BUTTON)
  await hold()
  await stripSays('Armed')

  expect(await exists(REVIEW)).toBe(false)
  expect(await window().text(DISARM)).toBe('Disarm')
})

it('disarms with a hold', async () => {
  await window().click(DISARM)
  await hold()
  await stripSays('Disarmed')
})

it('has the emergency stop under More only while armed, as a red hold, and the vehicle is disarmed after it', async () => {
  await armWithTheHold()
  await window().click(`${MORE} button`)
  await appears(STOP, 5000)

  expect(await window().evaluate<boolean>(`document.querySelector('${STOP}').classList.contains('danger')`)).toBe(true)
  expect(await window().text(STOP)).toBe('Emergency stop')
  await window().click(STOP)
  await appears('#confirm-hold')

  expect(await window().text('#confirm-hold')).toBe('Hold to stop the motors')
  await hold()
  await stripSays('Disarmed')

  expect(await exists(MORE)).toBe(false)
})
