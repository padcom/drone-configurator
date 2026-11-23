// Reconnecting in the real window against the fake vehicle (the simulated vehicle behind a TCP port, no SITL), through a proxy
// that can be cut (flaky-proxy.ts): while the cable is pulled the app says it is trying again and keeps the telemetry and the
// parameters on screen; when it is plugged in, the same vehicle is back and the parameters are not downloaded again: the line
// under the list says the resume kept them all. The run against ArduPilot SITL, with cuts in the middle of a download and of a
// write, is sitl-reconnect.e2e.ts; what a resume asks the vehicle for is in the backend's tests (paramcache.test.pi).
//
// The checks are in order and each goes on from the one before (one app, one connection).
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showAllParameters, showScreen } from './click'
import { FlakyProxy } from './flaky-proxy'
import { TcpVehicle } from './tcp-vehicle'

const RECONNECT_MS = 30_000
const LONG_MS = 60_000

let vehicle: TcpVehicle | undefined
let proxy: FlakyProxy | undefined
let app: E2eApp | undefined
let count = 0

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
 * The proxy between the app and the vehicle.
 *
 * @returns the proxy
 * @throws {Error} before it has started
 */
function cable(): FlakyProxy {
  if (!proxy) {
    throw new Error('the proxy has not started')
  }

  return proxy
}

/** Starts the vehicle, the proxy in front of it and the app, and points the app at the proxy. */
async function startAll(): Promise<void> {
  vehicle = await TcpVehicle.start()
  proxy = await FlakyProxy.start({ host: '127.0.0.1', port: vehicle.port })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(proxy.port) })
}

/** Stops what is running. */
async function stopAll(): Promise<void> {
  await app?.close()
  await proxy?.stop()
  vehicle?.stop()
}

/**
 * How many rows the parameter table has.
 *
 * @returns the count
 */
function rows(): Promise<number> {
  return window().evaluate<number>(`document.querySelectorAll('#rows tr').length`)
}

/** Connects through the proxy and downloads the whole list. */
async function connectsAndDownloads(): Promise<void> {
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', RECONNECT_MS)
  await showScreen(window(), 'parameters')
  await showAllParameters(window())
  const status = await window().waitForText('#list-status', /^\d+ parameters$/u, RECONNECT_MS)
  count = Number.parseInt(status, 10)
  expect(count).toBeGreaterThanOrEqual(12)
  expect(await window().waitForText('#download-status', /^Parameters: \d+ · by /u)).not.toMatch(/resumed/u)
}

/** The cable pulled: the app says it is trying again, and the telemetry and the parameters stay on screen, marked as old. */
async function keepsWhatItHadWhileCut(): Promise<void> {
  await showScreen(window(), 'flight')
  await window().waitForText('#telemetry', /BATTERY\s*\d/u, RECONNECT_MS)
  cable().cut()
  expect(await window().waitForText('#connection', /reconnecting/u, RECONNECT_MS)).toMatch(/try \d+, the next in \d+ s/u)
  expect(await window().waitForText('#telemetry', /last heard/u, RECONNECT_MS)).toMatch(/BATTERY\s*last heard\s*\d/u)
  await showScreen(window(), 'parameters')
  await showAllParameters(window())
  expect(await window().text('#list-status')).toBe(`${count} parameters`)
  expect(await rows()).toBeGreaterThan(0)
  expect(await window().text('#connection')).toMatch(/reconnecting/u)
}

/** Plugged in again: the same vehicle, and its list is resumed from what the app kept, nothing read again. */
async function resumesWithoutDownloadingAgain(): Promise<void> {
  cable().restore()
  await window().waitForText('#connection', 'reconnected to the same vehicle', RECONNECT_MS)
  await showScreen(window(), 'parameters')
  const line = await window().waitForText('#download-status', /resumed after the link came back/u, RECONNECT_MS)
  const kept = `Parameters: ${count} · resumed after the link came back: ${count} kept, 0 read again in `
  expect(line.startsWith(kept)).toBe(true)
  expect(await window().text('#list-status')).toBe(`${count} parameters`)
}

describe('reconnecting to the fake vehicle', () => {
  beforeAll(startAll, LONG_MS)
  afterAll(stopAll)
  it('connects through the proxy and downloads the whole list', connectsAndDownloads, LONG_MS)
  it('keeps the telemetry and the parameters on screen while the cable is pulled', keepsWhatItHadWhileCut, LONG_MS)
  it('resumes the same vehicle without downloading its parameters again', resumesWithoutDownloadingAgain, LONG_MS)
  it('closes cleanly while connected', async () => {
    expect(await window().close()).toBe(0)
    app = undefined
  })
})
