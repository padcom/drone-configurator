// The parameter download by file transfer (MAVLink FTP), against ArduPilot SITL in the real window: the Download goes by the
// vehicle's parameter file and the line under the list says so; with the file transfer turned off in the vehicle
// (BRD_OPTIONS bit 1, DISABLE_FTP: the vehicle still says it has it, and does not answer) the download can be cancelled from
// its toast, and the next one falls back to the list and says why. It launches its own SITL, so it ignores SITL_ENDPOINT.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { type E2eApp, launchApp } from './launch'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showAllParameters, showParameter, showScreen } from './click'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** How long a connection and a full download by file transfer may take (it takes about a second on a good machine). */
const DOWNLOAD_MS = 45_000
/** A check waits for up to three things of DOWNLOAD_MS: the time its test is given (as sitl-reconnect's LONG_MS). */
const LONG_MS = 3 * DOWNLOAD_MS
/** A download that falls back to the list after the file transfer got no answer: the file transfer waits some seconds first. */
const FALLBACK_MS = 90_000
/** BRD_OPTIONS bit 1: DISABLE_FTP. */
const DISABLE_FTP = 2
/**
 * The file transfer waits about 4 s (one second, four tries) for a vehicle that does not answer: a download that did is slower
 * than this, one that went straight to the list is faster (the list on a SITL takes about a second).
 */
const WAITED_S = 3.5
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

/**
 * The seconds a download took, as the line under the list says them (the failed attempt of the file transfer is in them).
 *
 * @param line the line
 * @returns the seconds
 */
function secondsIn(line: string): number {
  const found = /in (?<seconds>\d+(?:[.,]\d+)?) s/u.exec(line)
  if (!found?.groups?.seconds) {
    throw new Error(`no time in "${line}"`)
  }

  return Number.parseFloat(found.groups.seconds.replace(',', '.'))
}

/** Starts SITL and the app, and points the app at the vehicle. */
async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
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
 * Turns the file transfer off in the vehicle: BRD_OPTIONS as the vehicle has it (read from the list on screen), with bit 1 added.
 *
 * @returns once the vehicle reports the value
 */
async function disableFileTransfer(): Promise<void> {
  await showParameter(window(), 'BRD_OPTIONS')
  const current = Number(await window().text('tr[data-id="BRD_OPTIONS"] td.num'))
  await showAllParameters(window())

  await sitl?.setParam('BRD_OPTIONS', current | DISABLE_FTP)
}

/**
 * Waits for the Cancel button of the toast of the download that has just been asked for, and presses it. A download that has
 * ended before it appeared (its line changed) is a failure at once, with a message that says so, not a wait.
 *
 * @param before the line under the list before the download was asked for
 */
async function cancelWhenItRuns(before: string): Promise<void> {
  await window().waitFor(`document.querySelector('${CANCEL_BUTTON}') !== null
    || document.querySelector('#download-status')?.textContent !== ${JSON.stringify(before)}`, DOWNLOAD_MS)

  if (!await window().evaluate<boolean>(`document.querySelector('${CANCEL_BUTTON}') !== null`)) {
    throw new Error('the download ended before it could be cancelled: the vehicle answered the file transfer')
  }
  await window().click(CANCEL_BUTTON)
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
  const line = await howItCame()
  await disableFileTransfer()
  await window().click('#refresh')

  // The toast of the running download, whose close button is called what it does.
  await cancelWhenItRuns(line)

  // (Other toasts, the vehicle's own messages, may stand before it.)
  await window().waitFor(
    `[...document.querySelectorAll('.kit-toast')].some(t => /Download cancelled/u.test(t.textContent))`,
    DOWNLOAD_MS,
  )
  expect(await window().text('#list-status')).toBe(before)
  // The line is still about the download that gave the list.
  expect(await howItCame()).toBe(line)
}

async function fallsBackToTheList(): Promise<void> {
  await window().click('#refresh')

  const line = await window().waitForText('#download-status', /by list in/u, FALLBACK_MS)
  expect(line).toMatch(/\(file transfer is not used: it did not answer\)$/u)
  expect(await window().text('#list-status')).toMatch(/^\d+ parameters$/u)
  // It waited for the file transfer first.
  expect(secondsIn(line)).toBeGreaterThanOrEqual(WAITED_S)
}

async function skipsTheFileTransferOnce(): Promise<void> {
  const waited = await howItCame()
  await window().click('#refresh')

  await window().waitFor(`document.querySelector('#download-status')?.textContent !== ${JSON.stringify(waited)}
    && !document.querySelector('${CANCEL_BUTTON}')`, FALLBACK_MS)
  const line = await howItCame()
  // A timeout is remembered for one download: this one went straight to the list (no wait for the file transfer in its time)...
  expect(line).toMatch(/by list in .*\(file transfer is not used: it did not answer\)$/u)
  expect(secondsIn(line)).toBeLessThan(WAITED_S)

  // ...and the one after tries the file transfer again, and waits for it.
  await window().click('#refresh')
  await window().waitFor(`document.querySelector('#download-status')?.textContent !== ${JSON.stringify(line)}
    && !document.querySelector('${CANCEL_BUTTON}')`, FALLBACK_MS)
  expect(secondsIn(await howItCame())).toBeGreaterThanOrEqual(WAITED_S)
}

describeSitl('the parameter download by file transfer against ArduPilot SITL', () => {
  beforeAll(startAll, 120_000)
  afterAll(stopAll)

  it('downloads the whole list by file transfer, and says so under the list', downloadsByFileTransfer, LONG_MS)
  it('cancels a download that waits for a vehicle that does not answer, and keeps the list', cancelsADownloadThatWaits, LONG_MS)
  it('falls back to the list when the file transfer gets no answer, and says why', fallsBackToTheList, FALLBACK_MS + 30_000)
  it('skips the file transfer once after a timeout, and tries it again after', skipsTheFileTransferOnce, 2 * FALLBACK_MS)
})
