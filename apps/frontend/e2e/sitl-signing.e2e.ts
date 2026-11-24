// MAVLink signing (#33) against ArduPilot SITL in the real window: from Setup › Signing a key is made from a passphrase (typed,
// and sent with Enter, as a user does), the question that says what losing it means is answered, and SITL takes the key: the
// app's link signs and the status bar says "Signed". The app disconnects and connects again, and the link signs by itself with
// the key it kept (SITL keeps its key and signs everything from then on). Signing is then turned off, and the key forgotten.
// SITL's first port counts as USB (ArduPilot still answers unsigned commands there), so the check that the link signs is the
// app's, which drops what is not signed with its key. It launches its own SITL, so it ignores SITL_ENDPOINT. The same without
// SITL, in CI on every change: signing.e2e.ts.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long a connection or a change of signing may take. */
const WAIT_MS = 45_000
/** The app's data folder in this file's run. */
const DATA = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')

// What the run has started (undefined until it has).
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

/**
 * The keys the backend keeps, as hex.
 *
 * @returns the keys
 */
function keptKeys(): string[] {
  const doc = JSON.parse(readFileSync(join(DATA, 'signing-keys.json'), 'utf8')) as { vehicles: { key: string }[] }

  return doc.vehicles.map(v => v.key)
}

/** Connects to SITL, and waits for the link. */
async function connect(): Promise<void> {
  if (!sitl) {
    throw new Error('SITL has not started')
  }
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(window(), { transport, host, port: String(port) })
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', WAIT_MS)
}

/** Starts SITL and the app, and connects. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await connect()
}

/** Stops what was started: the SITL also when the app does not close. */
async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

/**
 * Presses Enter as a keyboard does, with the character it types (a browser submits a form on that character).
 */
async function pressEnter(): Promise<void> {
  const key = { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter' }
  await window().devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key })
  await window().devtools('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...key })
  await window().devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
}

async function provisionsAKey(): Promise<void> {
  const w = window()
  await w.waitForText('#link-signing', 'Unsigned', WAIT_MS)
  await showScreen(w, 'setup')
  await w.click('#link-signing')
  await w.waitFor(`document.querySelector('#signing-form') !== null`, WAIT_MS)
  // (the waits of the backend: the vehicle's state is known once its heartbeat is)
  await w.waitFor(`document.querySelector('#signing-blocked')?.classList.contains('empty') === true`, WAIT_MS)
  await w.click('#signing-form .kit-segmented label:nth-of-type(2) input')
  await w.waitFor(`document.querySelector('#signing-form input[type="password"]') !== null`)
  await w.fill('#signing-form input[type="password"]', 'a passphrase for SITL')
  await w.evaluate(`document.querySelector('#signing-form input[type="password"]').focus()`)
  await pressEnter()
  await w.waitFor(`document.querySelector('#confirm') !== null`)
  expect(await w.text('#confirm')).toContain('reset over USB')
  await confirmWrite(w)
  await w.waitFor(`document.querySelector('#signing-state').dataset.state === 'signed'`, WAIT_MS)
  await w.waitForText('#link-signing', 'Signed', WAIT_MS)
  expect(keptKeys()).toHaveLength(1)
}

async function reconnectsSigned(): Promise<void> {
  const w = window()
  await w.click('#disconnect-button')
  await w.waitForText('#connection', 'disconnected', WAIT_MS)
  await connect()
  await w.waitForText('#link-signing', 'Signed', WAIT_MS)
  // The parameters come over the signed link.
  await showScreen(w, 'parameters')
  await w.waitForText('#list-status', /^\d+ parameters$/u, 2 * WAIT_MS)
  const page = await w.evaluate<string>('document.documentElement.outerHTML')
  expect(page.includes(keptKeys()[0]!)).toBe(false)
  expect(w.log.some(line => line.includes(keptKeys()[0]!))).toBe(false)
}

async function turnsItOff(): Promise<void> {
  const w = window()
  await w.click('#link-signing')
  await w.waitFor(`document.querySelector('#signing-off:not([disabled])') !== null`, WAIT_MS)
  await w.click('#signing-off')
  await confirmWrite(w)
  await w.waitFor(`document.querySelector('#signing-state').dataset.state === 'off'`, WAIT_MS)
  await w.waitForText('#link-signing', 'Unsigned', WAIT_MS)
  expect(keptKeys()).toHaveLength(0)
}

describeSitl('MAVLink signing against ArduPilot SITL', () => {
  beforeAll(startAll, 180_000)
  afterAll(stopAll)

  it('provisions a key made from a passphrase, and the link signs', provisionsAKey, 2 * WAIT_MS)
  it('connects again and signs by itself with the key it kept', reconnectsSigned, 4 * WAIT_MS)
  it('turns signing off and forgets the key', turnsItOff, 2 * WAIT_MS)
}, { launchOnly: true })
