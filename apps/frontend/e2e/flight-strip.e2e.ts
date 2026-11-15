// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the controls of a
// flight, above the map (a notice comes up at the bottom left and must never cover them). The vehicle starts disarmed (it never
// arms by itself here). STATE of the top bar is the arm control: it opens the review (what the vehicle says of its checks, in its
// words), "Arm…" asks for a HOLD, and the state is the vehicle's heartbeat's (the top bar's STATE cell). A hold of "Disarm"
// disarms; the emergency stop is
// under "More", only while armed, and is a red hold. The strip fits the column. What the real autopilot does with these commands
// is sitl-arming.e2e.ts.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { DISARM, MODE_BUTTON, MODE_ITEMS, MORE, REVIEW, sleep, STOP, Strip } from './strip'
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
 * What the tests do in the window.
 *
 * @returns the helpers
 */
function strip(): Strip {
  return new Strip(window())
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
  await strip().heartbeatSays(false)

  // (the cell's CSS upper-cases it: the words are the state's)
  expect((await window().text(REVIEW)).toLowerCase()).toBe('disarmed')
  expect(await strip().exists(DISARM)).toBe(false)
  expect(await strip().exists(MORE)).toBe(false)
  await window().waitFor(`document.querySelector('${MODE_BUTTON}')?.getAttribute('aria-label')?.startsWith('Mode: ')`, 30_000)
  await window().click(MODE_BUTTON)
  await window().waitFor(`document.querySelectorAll('${MODE_ITEMS}').length > 5`, 10_000)
  const modes = await window().evaluate<string[]>(`[...document.querySelectorAll('${MODE_ITEMS}')].map(o => o.innerText)`)

  expect(modes.some(mode => mode.startsWith('RTL'))).toBe(true)
  // (closing it sends nothing)
  await window().click(MODE_BUTTON)
})

it('fits its column: nothing in the strip is wider than the strip, and the page does not scroll sideways', async () => {
  const fits = await window().evaluate<boolean>(`(() => {
    const strip = document.querySelector('#flight-strip')
    const page = document.documentElement
    return strip.scrollWidth <= strip.clientWidth + 1 && page.scrollWidth <= page.clientWidth + 1
  })()`)

  expect(fits).toBe(true)
})

it('turns the arm hold down with Escape and the cross: no Cancel button, the hold button has the focus', async () => {
  await strip().startArming()
  await strip().appears('#confirm-hold')

  expect(await strip().exists('#confirm-cancel')).toBe(false)
  expect(await window().evaluate<string>(`document.activeElement?.id`)).toBe('confirm-hold')
  expect(await strip().exists('#confirm .kit-dialog-close')).toBe(true)
  await sleep(600)
  await window().press('Escape')
  await strip().goes('#confirm')
  // the cross does the same
  await strip().startArming()
  await strip().appears('#confirm-hold')
  await window().click('#confirm .kit-dialog-close')
  await strip().goes('#confirm')
  await sleep(1500)

  expect(await strip().exists(DISARM)).toBe(false)
})

/** The windows the list of modes must stay reachable in: where the top bar wraps (below 1000 px) and a short one. */
const LIST_SIZES = [{ width: 999, height: 700 }, { width: 1000, height: 500 }, { width: 1200, height: 360 }]

for (const size of LIST_SIZES) {
  it(`keeps the list of modes reachable at ${size.width}x${size.height}: inside the window, scrolls to the last`, async () => {
    await window().devtools('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1, mobile: false })
    await sleep(300)
    await window().click(MODE_BUTTON)
    await window().waitFor(`document.querySelectorAll('${MODE_ITEMS}').length > 5`, 10_000)
    const facts = await window().evaluate<Record<string, unknown>>(`(() => {
      const list = document.querySelector('.cell.mode [role="menu"]')
      const inside = list.getBoundingClientRect().bottom <= window.innerHeight
      const scrolls = list.scrollHeight > list.clientHeight
      list.scrollTop = list.scrollHeight
      const last = list.querySelector('[role="menuitem"]:last-child').getBoundingClientRect().bottom <= window.innerHeight + 1
      const items = list.querySelectorAll('[role="menuitem"]').length
      const [high, whole] = [list.clientHeight, list.scrollHeight]
      return { inside, scrolls, last, items, high, whole, style: list.getAttribute('style') }
    })()`)
    await window().press('Escape')
    await window().devtools('Emulation.clearDeviceMetricsOverride')

    expect(facts, JSON.stringify(facts)).toMatchObject({ inside: true, scrolls: true, last: true })
  })
}

it('goes straight to the hold when the vehicle does not report its checks; armed when the vehicle says', async () => {
  // (the simulated vehicle says nothing of its checks: there is nothing to review before the arm is asked for)
  await window().click(REVIEW)
  await strip().appears('#confirm-hold')

  expect(await strip().exists('#review-state')).toBe(false)
  await strip().hold()
  await strip().heartbeatSays(true)

  expect(await strip().exists(REVIEW)).toBe(false)
  expect(await window().text(DISARM)).toBe('Disarm')
})

it('asks plainly before a mode is changed while armed, and a cancel changes nothing', async () => {
  await window().click(MODE_BUTTON)
  await window().waitFor(`document.querySelectorAll('${MODE_ITEMS}').length > 5`, 10_000)
  await window().evaluate(`[...document.querySelectorAll('${MODE_ITEMS}')].find(o => o.innerText.startsWith('GUIDED')).click()`)
  await strip().appears('#confirm-yes', 5000)
  // (a question ignores presses for its first moments)
  await sleep(700)
  await window().click('#confirm-cancel')
  await strip().goes('#confirm')
  await sleep(1500)

  expect(await window().text(MODE_BUTTON)).not.toBe('GUIDED')
})

it('disarms with a hold', async () => {
  await window().click(DISARM)
  await strip().hold()
  await strip().heartbeatSays(false)
})

it('has the emergency stop under More only while armed, as a red hold, and the vehicle is disarmed after it', async () => {
  await strip().armWithTheHold()
  await window().click(`${MORE} button`)
  await strip().appears(STOP, 5000)

  expect(await window().evaluate<boolean>(`document.querySelector('${STOP}').classList.contains('danger')`)).toBe(true)
  expect(await window().text(STOP)).toBe('Emergency stop')
  await window().click(STOP)
  await strip().appears('#confirm-hold')

  expect(await window().text('#confirm-hold')).toBe('Hold to stop the motors')
  await strip().hold()
  await strip().heartbeatSays(false)
  await strip().goes(MORE)
})

it('disarms and stops from any screen: a vehicle armed here is one click from Disarm and the stop on Setup too', async () => {
  await strip().armWithTheHold()
  await showScreen(window(), 'setup')
  await strip().appears('#state-menu')
  await window().click('#state-menu button')
  await strip().appears('#state-menu [role="menuitem"]')

  const items = `[...document.querySelectorAll('#state-menu [role="menuitem"]')]`

  expect(await window().evaluate<string[]>(`${items}.map(i => i.innerText)`)).toEqual(['Disarm', 'Emergency stop'])
  await window().evaluate(`${items}[1].click()`)
  await strip().appears('#confirm-hold')

  expect(await window().text('#confirm-hold')).toBe('Hold to stop the motors')
  await strip().hold()
  await strip().heartbeatSays(false)
  await showScreen(window(), 'flight')
})
