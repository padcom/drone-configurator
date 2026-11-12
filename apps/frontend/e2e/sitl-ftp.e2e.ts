// The parameter download by file transfer (MAVLink FTP), against ArduPilot SITL in the real window: the Download goes by the
// vehicle's parameter file and the line under the list says so; with the file transfer turned off in the vehicle
// (BRD_OPTIONS bit 1, DISABLE_FTP: the vehicle still says it has it, and does not answer) the download can be cancelled from
// its toast, and the next one falls back to the list and says why. It launches its own SITL, so it ignores SITL_ENDPOINT.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long a connection and a full download by file transfer may take (it takes about a second on a good machine). */
const DOWNLOAD_MS = 45_000
/** A download that falls back to the list after the file transfer got no answer: the file transfer waits some seconds first. */
const FALLBACK_MS = 90_000
/** BRD_OPTIONS bit 1: DISABLE_FTP. */
const DISABLE_FTP = 2
/** The close button of the toast of a download that is running. */
const CANCEL_BUTTON = '.kit-toast .dismiss[aria-label="Cancel download"]'

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
 * The line under the list that says how the last download came.
 *
 * @returns its text, '' when it is not there
 */
const howItCame = () => window().evaluate<string>(`document.querySelector('#download-status')?.textContent ?? ''`)

/** Starts SITL and the app, and points the app at the vehicle. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
}

/** Stops what was started. */
async function stopAll(): Promise<void> {
  await app?.close()
  await sitl?.stop()
}

async function downloadsByFileTransfer(): Promise<void> {
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', DOWNLOAD_MS)
  await showScreen(window(), 'parameters')
  const status = await window().waitForText('#list-status', /^\d+ parameters$/u, DOWNLOAD_MS)
  expect(Number.parseInt(status, 10)).toBeGreaterThanOrEqual(300)

  const line = await window().waitForText('#download-status', /by file transfer in/u, DOWNLOAD_MS)
  expect(line).toMatch(/^Parameters: \d+ · by file transfer in \d+(?:[.,]\d)? s$/u)
  // The count in the line is the count in the list.
  expect(Number.parseInt(line.replace(/^Parameters: /u, ''), 10)).toBe(Number.parseInt(status, 10))
}

async function cancelsADownloadThatWaits(): Promise<void> {
  const before = await window().text('#list-status')
  await sitl?.setParam('BRD_OPTIONS', DISABLE_FTP)
  await window().click('#refresh')

  // The toast of the running download, whose close button is called what it does.
  await window().waitFor(`document.querySelector('${CANCEL_BUTTON}') !== null`, DOWNLOAD_MS)
  await window().click(CANCEL_BUTTON)

  await window().waitForText('.kit-toast', /Download cancelled/u, DOWNLOAD_MS)
  expect(await window().text('#list-status')).toBe(before)
  // The line is still about the download that gave the list.
  expect(await howItCame()).toMatch(/by file transfer in/u)
}

async function fallsBackToTheList(): Promise<void> {
  await window().click('#refresh')

  const line = await window().waitForText('#download-status', /by list in/u, FALLBACK_MS)
  expect(line).toMatch(/\(file transfer is not used: it did not answer\)$/u)
  expect(await window().text('#list-status')).toMatch(/^\d+ parameters$/u)
}

async function skipsTheFileTransferOnce(): Promise<void> {
  const started = Date.now()
  await window().click('#refresh')

  await window().waitFor(`document.querySelector('#download-status')?.textContent.includes('by list')
    && !document.querySelector('${CANCEL_BUTTON}')`, FALLBACK_MS)
  // No waiting for a file transfer that does not answer: only the list's own time (a few seconds on a SITL).
  expect(Date.now() - started).toBeLessThan(30_000)
  expect(await howItCame()).toMatch(/by list in/u)
}

describeSitl('the parameter download by file transfer against ArduPilot SITL', () => {
  beforeAll(startAll, 120_000)
  afterAll(stopAll)

  it('downloads the whole list by file transfer, and says so under the list', downloadsByFileTransfer)
  it('cancels a download that is waiting for a vehicle that does not answer, and keeps the list', cancelsADownloadThatWaits)
  it('falls back to the list when the file transfer gets no answer, and says why', fallsBackToTheList, FALLBACK_MS + 30_000)
  it('goes straight to the list for the next download, which a timeout skips once', skipsTheFileTransferOnce, FALLBACK_MS)
})
