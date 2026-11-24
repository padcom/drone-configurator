// One-key connect against ArduPilot SITL (#27): from Ctrl+L (connect to the last vehicle again) to the top bar saying
// connected, within the `oneKeyConnect` budget (2 s), once the vehicle's parameters were downloaded. The time is taken in the
// page: from the key's own keydown to the change of the top bar's status. It launches its own SITL, so it ignores
// SITL_ENDPOINT. The remembered connection, the key and the click against the fake vehicle are one-key.e2e.ts.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { expectWithinBudget } from './budgets'
import { chooseConnection, clickConnect, showAllParameters, showScreen } from './click'
import { type E2eApp, launchApp } from './launch'
import { CTRL, chord, pageIsReady } from './palette-keys'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** SITL starting (up to 60 s), the app launching, the connection and the first download. */
const STARTUP_MS = 180_000
const CONNECT_MS = 30_000
const SAMPLES_MS = 240_000
/** How many times the key is timed. */
const SAMPLES = 7
const CONNECTED = 'connected · system'

/** Notes, in the page, when Ctrl+L goes down and when the top bar next says connected after it. */
const RECORDER = `(() => {
  const times = { pressed: 0, connected: 0 }
  window.__oneKey = times
  addEventListener('keydown', event => {
    if (event.code === 'KeyL' && event.ctrlKey) {
      times.pressed = performance.now()
      times.connected = 0
    }
  }, true)
  const status = document.querySelector('#connection')
  new MutationObserver(() => {
    const text = status.innerText
    const up = text.includes(${JSON.stringify(CONNECTED)}) && !text.includes('disconnected')
    if (times.pressed > 0 && times.connected === 0 && up) {
      times.connected = performance.now()
    }
  }).observe(status, { subtree: true, childList: true, characterData: true })
  return true
})()`

let sitl: Sitl | undefined
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

/** Starts SITL and the app, connects through the dialog and downloads the parameters once. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await pageIsReady(app)
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
  await clickConnect(app)
  await app.waitForText('#connection', CONNECTED, 60_000)
  await showScreen(app, 'parameters')
  await showAllParameters(app)
  await app.waitForText('#list-status', /^\d+ parameters$/u, 120_000)
  await app.evaluate(RECORDER)
}

/** Stops what is running. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

/**
 * Disconnects, presses the key and waits until the link is up again.
 *
 * @returns how long it took in the page (ms)
 */
async function sample(): Promise<number> {
  await window().click('#disconnect-button')
  await window().waitForText('#connection', 'disconnected', CONNECT_MS)
  await chord(window(), 'l', CTRL)
  await window().waitFor('window.__oneKey.connected > 0', CONNECT_MS)

  return window().evaluate<number>('window.__oneKey.connected - window.__oneKey.pressed')
}

/** Times the key, one sample after the other, and judges them against the budget. */
async function withinBudget(): Promise<void> {
  const times: number[] = []
  for (let index = 0; index < SAMPLES; index++) {
    // eslint-disable-next-line no-await-in-loop -- one connection after the other
    times.push(await sample())
  }
  expect(times.every(ms => ms > 0)).toBe(true)
  expectWithinBudget('oneKeyConnect', times)
}

describeSitl('one-key connect to ArduPilot SITL', () => {
  beforeAll(startAll, STARTUP_MS)
  afterAll(stopAll, 60_000)
  it('connects to the last vehicle again within the budget, from the key to the top bar', withinBudget, SAMPLES_MS)
}, { launchOnly: true })
