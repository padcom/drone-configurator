// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): MAVLink signing
// (#33). The status bar says the link is unsigned and leads to Setup › Signing; a random key is set after the question that
// says what losing it means; the vehicle takes it and the status bar says "Signed". The next connection signs by itself (the
// vehicle keeps its key, as a real one does). The key is kept by the backend in a file of its own that only the user can read,
// and its bytes, in any form, are in nothing else: not the settings, not the page, not what the app or the vehicle printed.
// Signing is then turned off and the key forgotten. The SITL version is sitl-signing.e2e.ts.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, confirmWrite, showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { TcpVehicle } from './tcp-vehicle'

/** How long a connection or a change of signing may take. */
const WAIT_MS = 30_000
/** The app's data folder in this file's run. */
const DATA = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')

let app: E2eApp
let vehicle: TcpVehicle

/**
 * The keys file the backend keeps.
 *
 * @returns its keys, as hex
 */
function keptKeys(): string[] {
  const doc = JSON.parse(readFileSync(join(DATA, 'signing-keys.json'), 'utf8')) as { vehicles: { key: string }[] }

  return doc.vehicles.map(v => v.key)
}

/**
 * The forms a key could be given away in: its hex in both cases, and its base64.
 *
 * @param hex the key as hex
 * @returns the forms
 */
function formsOf(hex: string): string[] {
  return [hex, hex.toUpperCase(), Buffer.from(hex, 'hex').toString('base64')]
}

/** Connects to the vehicle, and waits for the link. */
async function connect(): Promise<void> {
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', WAIT_MS)
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(false, true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await connect()
}, 180_000)

afterAll(async () => {
  await app?.close()
  vehicle?.stop()
})

it('says the link is unsigned, and leads from the status bar to the Signing page', async () => {
  await app.waitForText('#link-signing', 'Unsigned', WAIT_MS)
  await showScreen(app, 'setup')
  await app.click('#link-signing')
  await app.waitFor(`document.querySelector('#signing-state') !== null`, WAIT_MS)
  expect(await app.evaluate<string>(`document.querySelector('#signing-state').dataset.state`)).toBe('off')
})

it('sets a random key after a question that says what losing it means, and the link is signed', async () => {
  await app.waitFor(`document.querySelector('#signing-on:not([disabled])') !== null`, WAIT_MS)
  await app.click('#signing-on')
  await app.waitFor(`document.querySelector('#confirm') !== null`)
  expect(await app.text('#confirm')).toContain('reset over USB')
  await confirmWrite(app)
  await app.waitFor(`document.querySelector('#signing-state').dataset.state === 'signed'`, WAIT_MS)
  await app.waitForText('#link-signing', 'Signed', WAIT_MS)
  expect(vehicle.signingSetups).toBeGreaterThanOrEqual(1)
  expect(await app.text('#signing-fingerprint')).toMatch(/^[\da-f]{8}$/u)
})

it('keeps the key in a file only the user can read, and nowhere else', async () => {
  const keys = keptKeys()
  expect(keys).toHaveLength(1)
  expect(keys[0]).toMatch(/^[\da-f]{64}$/u)

  if (process.platform !== 'win32') {
    expect(statSync(join(DATA, 'signing-keys.json')).mode & 0o777).toBe(0o600)
  }
  const page = await app.evaluate<string>('document.documentElement.outerHTML')
  const settings = readFileSync(join(DATA, 'settings.json'), 'utf8')
  for (const form of formsOf(keys[0]!)) {
    expect(page.includes(form)).toBe(false)
    expect(settings.includes(form)).toBe(false)
    expect(app.log.some(line => line.includes(form))).toBe(false)
    expect(vehicle.lines.some(line => line.includes(form))).toBe(false)
  }
})

it('signs by itself on the next connection', async () => {
  await app.click('#disconnect-button')
  await app.waitForText('#connection', 'disconnected', WAIT_MS)
  await connect()
  expect(vehicle.startedSigned).toBe(true)
  await app.waitForText('#link-signing', 'Signed', WAIT_MS)
})

it('turns signing off after a question, and forgets the key', async () => {
  await app.click('#link-signing')
  await app.waitFor(`document.querySelector('#signing-off:not([disabled])') !== null`, WAIT_MS)
  await app.click('#signing-off')
  await confirmWrite(app)
  await app.waitFor(`document.querySelector('#signing-state').dataset.state === 'off'`, WAIT_MS)
  await app.waitForText('#link-signing', 'Unsigned', WAIT_MS)
  expect(keptKeys()).toHaveLength(0)
})
