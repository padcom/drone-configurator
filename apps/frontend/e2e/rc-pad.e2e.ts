// End to end, in the real window with the real backend, no vehicle and no radio: where the gamepad is read from (Settings >
// Remote control). The browser's pad is a scripted one (the window has none: `navigator.getGamepads` is replaced), so that the
// page's whole path is walked: every axis of the radio shows and moves (CH4 and CH7, the axes a browser may miss, among them),
// an unplug is said, and a radio plugged in after it is shown. Then the backend is chosen: its `pad.list` is asked for over the
// page's own bridge, and what the screen says follows what the backend answered (a pad backend that sees no pad, or none on this
// platform). No radio is moved through the backend here (a real one is the leader's hardware check:
// docs/rc-pad-hardware-check.md), and no control is ever turned on: nothing here talks to a vehicle.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { BridgeClient } from './bridge-client'
import { showScreen } from './click'
import { type E2eApp, launchApp } from './launch'

let app: E2eApp | undefined
let bridge: BridgeClient | undefined

const RADIO = 'E2E Radio (Vendor: 0000 Product: 0001)'
const SECOND = 'E2E Second Radio (Vendor: 0000 Product: 0002)'

/**
 * A scripted radio the window's `navigator.getGamepads` says: 8 axes (CH4 and CH7 moved) and 6 buttons.
 *
 * @param id the radio's id string
 * @returns the script to run in the page
 */
const plug = (id: string): string => `(() => {
  window.__pad = { id: ${JSON.stringify(id)}, index: 0, connected: true, axes: [0, 0, -1, 0.5, 0, 0, -0.75, 0] }
  window.__pad.buttons = Array.from({ length: 6 }, () => ({ value: 0 }))
  navigator.getGamepads = () => [window.__pad ?? null]
})()`

/** What the page shows of CH1 to CH16: the number of each, or null for a channel shown as absent. */
const SHOWN = `JSON.stringify([...document.querySelectorAll('.rc-axes li')].map(li => (
  li.classList.contains('rc-absent') ? null : parseFloat(li.querySelector('.mono').textContent.replace('−', '-'))
)))`

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
 * The client of the backend over the page's bridge.
 *
 * @returns the client
 * @throws {Error} before it has started
 */
function client(): BridgeClient {
  if (!bridge) {
    throw new Error('the client has not started')
  }

  return bridge
}

/**
 * What the screen shows of the 16 channels.
 *
 * @returns each channel's number, null for one the pad does not have
 */
async function shown(): Promise<(number | null)[]> {
  return JSON.parse(await window().evaluate<string>(SHOWN)) as (number | null)[]
}

beforeAll(async () => {
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  bridge = new BridgeClient(app)
  await bridge.install()
  await showScreen(app, 'settings')
  await app.waitFor(`document.querySelector('#rc-allow') !== null`, 60_000)
  await app.evaluate(plug(RADIO))
  await app.waitFor(`document.querySelector('#rc-device-name') !== null`, 30_000)
}, 180_000)

afterAll(async () => {
  await app?.close()
})

it('reads the browser\'s pad by default, with the backend not asked to read any', async () => {
  expect(await window().evaluate<boolean>(`document.querySelector('input[id$="-source-browser"]').checked`)).toBe(true)
  expect(await window().text('#rc-device-name')).toBe(RADIO)
})

it('shows every axis of the radio, CH4 and CH7 among them, and the buttons after them', async () => {
  await window().waitFor(`(${SHOWN}).includes('0.5')`, 30_000)
  const channels = await shown()

  expect(channels).toHaveLength(16)
  expect(channels.slice(0, 8)).toEqual([0, 0, -1, 0.5, 0, 0, -0.75, 0])
  // (the 6 buttons are CH9 to CH14, up at -1; CH15 and CH16 are not there)
  expect(channels.slice(8, 14)).toEqual([-1, -1, -1, -1, -1, -1])
  expect(channels.slice(14)).toEqual([null, null])
})

it('follows CH4 and CH7 as they move', async () => {
  await window().evaluate(`(() => { window.__pad.axes[3] = -0.25; window.__pad.axes[6] = 0.9 })()`)
  await window().waitFor(`(${SHOWN}).startsWith('[0,0,-1,-0.25,0,0,0.9')`, 30_000)

  expect((await shown()).slice(3, 7)).toEqual([-0.25, 0, 0, 0.9])
})

it('says the pad is gone when it is unplugged, and shows the radio that is plugged in after it', async () => {
  await window().evaluate(`(() => {
    window.__pad.connected = false
    window.__pad = null
    window.dispatchEvent(new Event('gamepaddisconnected'))
  })()`)
  await window().waitFor(`document.querySelector('#rc-device-gone') !== null`, 30_000)
  await window().evaluate(plug(SECOND))
  await window().waitFor(`document.querySelector('#rc-device-name')?.textContent === ${JSON.stringify(SECOND)}`, 30_000)

  expect(await window().evaluate<boolean>(`document.querySelector('#rc-device-gone') === null`)).toBe(true)
})

it('asks the backend for its pads when the backend is chosen, and says what it answered', async () => {
  const answer = await client().call('pad.list')
  const list = answer.result as { supported: boolean, pads: unknown[], denied: unknown[] }

  expect(answer.error).toBeUndefined()
  expect([typeof list.supported, Array.isArray(list.pads), Array.isArray(list.denied)]).toEqual(['boolean', true, true])
  await window().click('input[id$="-source-backend"]')
  await window().waitFor(`document.querySelector('input[id$="-source-backend"]').checked`, 30_000)
  // (the browser's pad is not the backend's: nothing is read, and the screen says whose words it is)
  await window().waitFor(
    `document.querySelector('#rc-device-gone') !== null || document.querySelector('#rc-no-device') !== null`,
    30_000,
  )

  const unsupported = await window().evaluate<boolean>(`document.querySelector('#rc-source-unsupported') !== null`)

  if (list.supported) {
    expect(unsupported).toBe(false)
    expect(await window().text('#rc-device-gone, #rc-no-device')).toContain('backend')
  } else {
    expect(unsupported).toBe(true)
  }
})

it('goes back to the browser\'s pad when it is chosen again, and keeps the choice in the settings', async () => {
  await window().click('input[id$="-source-browser"]')
  await window().waitFor(`document.querySelector('#rc-device-name')?.textContent === ${JSON.stringify(SECOND)}`, 30_000)
  await window().waitFor(`document.querySelector('#rc-device-gone') === null`, 30_000)

  expect(await window().evaluate<boolean>(`document.querySelector('input[id$="-source-browser"]').checked`)).toBe(true)
})

it('leaves remote control off, whichever source is read: choosing where the pad is read allows nothing', async () => {
  expect(await window().evaluate<string>(`document.querySelector('#rc-allow').getAttribute('aria-checked')`)).toBe('false')
})
