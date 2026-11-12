// The logs of the vehicle, against ArduPilot SITL in the real window: after a flight (arm in GUIDED, take off, land, driven over
// SITL's second TCP port) the log is on the vehicle and "On the vehicle" lists it; it is downloaded with progress, cancelled and
// gone on with, and checked by the vehicle's CRC. The copy in the app's data folder is the vehicle's file, byte for byte. It
// launches its own SITL (at speedup 1: the vehicle's file transfer fails at higher ones), so it ignores SITL_ENDPOINT.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** The flight, and the app's connection and first list, may take this long. */
const FLIGHT_MS = 300_000
/** Everything before the first check: SITL starting (up to 60 s), the flight (up to 240 s), and the app launching. */
const STARTUP_MS = 420_000
/** A download of a log of some megabytes. */
const DOWNLOAD_MS = 180_000
/** The first row of the table, and its parts. */
const ROW = 'table.logs-table tbody tr'
const STATE = `${ROW} .logs-state-text`

let sitl: Sitl | undefined
let app: E2eApp | undefined
/** Whether the first check found the download still running and cancelled it (on a very fast link it may be through already). */
let cancelled = false

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
 * The checked copy of the first log in the app's data folder: `<data>/.../logs/<vehicle>/00000001-<crc>.BIN`.
 *
 * @param dir the folder to look in
 * @returns its path
 * @throws {Error} when there is none
 */
function copyIn(dir: string): string {
  const found = readdirSync(dir, { recursive: true }).map(String)
    .find(path => path.includes(`logs${sep}`) && /00000001-[0-9a-f]{8}\.BIN$/u.test(path))
  if (found === undefined) {
    throw new Error(`no checked copy of log 1 under ${dir}`)
  }

  return join(dir, found)
}

/**
 * The text of the state cell of the first log.
 *
 * @returns its text, '' when it is not there
 */
const stateOfFirst = () => window().evaluate<string>(`document.querySelector('${STATE}')?.textContent ?? ''`)

/**
 * Waits a while.
 *
 * @param ms how long
 */
const pause = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/**
 * The size of a file.
 *
 * @param file its path
 * @returns its size, undefined when it is not there
 */
const sizeOf = (file: string) => statSync(file, { throwIfNoEntry: false })?.size

/**
 * Waits until the vehicle's file has not grown for 5 s. The vehicle goes on writing a log after the disarm (a megabyte in the
 * next 15 to 20 s, then tens of bytes), and a download of a file that grows is chased, not finished: what is checked here is the
 * app's download, not the chase.
 *
 * @param file the vehicle's file
 * @param last its size when last looked at
 * @param since when it last had that size (ms since 1970)
 */
async function waitForTheLogToSettle(file: string, last?: number, since = Date.now()): Promise<void> {
  if (Date.now() - since >= 5000) {
    return
  }
  await pause(500)
  const now = sizeOf(file)
  await waitForTheLogToSettle(file, now, now === last ? since : Date.now())
}

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  // The log is made at the arm: the flight comes first, and the app is connected after it. It is closed at the disarm: left open
  // (the default), the vehicle goes on writing a few bytes to it for as long as it runs, and its CRC is never the same twice.
  await sitl.setParam('LOG_FILE_DSRMROT', 1)
  await sitl.fly()
  await waitForTheLogToSettle(join(sitl.directory, 'logs', '00000001.BIN'))
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
}

async function stopAll(): Promise<void> {
  try {
    await app?.close()
  } finally {
    await sitl?.stop()
  }
}

/**
 * The size of the vehicle's file of log 1 now and two seconds later (a file that still grows says so), and of the files of the
 * app's folder for it.
 *
 * @returns a line for a failure message
 */
async function sizes(): Promise<string> {
  const size = () => statSync(join(sitl?.directory ?? '', 'logs', '00000001.BIN'), { throwIfNoEntry: false })?.size
  const before = size()
  await pause(2000)
  const mine = readdirSync(home, { recursive: true }).map(String).filter(path => /00000001/u.test(path))
    .map(path => `${path}=${statSync(join(home, path), { throwIfNoEntry: false })?.size}`)

  return `The vehicle's file: ${before} bytes, 2 s later ${size()}. In the app's folder: ${mine.join(', ')}`
}

/**
 * Waits for a page expression to be true. When it does not become so, the failure says what the page shows instead (its text,
 * which has the error or the empty-state words), what the buttons are, and what is in the SITL's log folder, so that the run's
 * log explains itself.
 *
 * @param expression the page expression
 * @param timeoutMs how long to wait
 * @param what what did not happen
 */
async function waitOrExplain(expression: string, timeoutMs: number, what: string): Promise<void> {
  try {
    await window().waitFor(expression, timeoutMs)
  } catch (error) {
    const text = `JSON.stringify({
      page: document.querySelector('main')?.innerText ?? '(no main)',
      download: document.querySelector('#logs-download')?.outerHTML ?? null,
      cancel: document.querySelector('#logs-cancel') !== null,
      checked: [...document.querySelectorAll('${ROW} input[type="checkbox"]')].map(box => box.checked),
    })`
    const page = await window().evaluate<string>(text).catch(() => '(unreadable)')
    const folder = readdirSync(join(sitl?.directory ?? '', 'logs')).join(', ')
    const where = `The page says:\n${page}\nSITL's logs/ holds: ${folder}\n${await sizes()}`
    throw new Error(`${what}. ${where}\n${String(error)}`, { cause: error })
  }
}

/** Waits for the first row of the table. */
async function waitForTheLog(): Promise<void> {
  await waitOrExplain(`document.querySelectorAll('${ROW}').length >= 1`, 60_000, 'the log of the flight is not listed')
}

async function listsTheLogOfTheFlight(): Promise<void> {
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', 60_000)
  await showScreen(window(), 'logs')
  await window().click('a[href="#/logs/vehicle"]')
  await waitForTheLog()

  // It is a log of 8 digits, the first, with a time where the firmware gives one (newer builds: the last write; Copter-4.7.2 has
  // no ListDirectoryWithTime, and the page says "No date"), not downloaded, and nothing was downloaded on its own.
  expect(await window().text(`${ROW} th`)).toBe('1')
  expect(await window().text(`${ROW} td:nth-child(3)`)).not.toBe('')
  expect(await stateOfFirst()).toBe('Not downloaded')
  expect(await window().evaluate<boolean>(`document.querySelector('#logs-erase')?.disabled === true`)).toBe(true)
}

/**
 * Presses a button, and presses it again while what it should have caused has not happened. A click through DevTools at a
 * place read a moment before the layout moved (the table gets a bar, a line of text, a new label) lands beside the button and
 * does nothing; the local run lost both the Download click and the Cancel click that way.
 *
 * @param button the button's selector
 * @param done a page expression that is true once the press had its effect
 * @param left how many presses remain
 */
async function pressUntil(button: string, done: string, left: number): Promise<void> {
  await window().waitFor(`document.querySelector('${button}')?.disabled === false`, 10_000)
  await window().evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
  await window().click(button)

  try {
    await window().waitFor(done, 5000)
  } catch (error) {
    if (left <= 1) {
      throw error
    }
    await pressUntil(button, done, left - 1)
  }
}

/** True once a download is under way (the bar of the log being fetched, or Cancel), or is through. */
const BEGUN = `document.querySelector('${ROW} [role="progressbar"]') !== null
  || document.querySelector('#logs-cancel') !== null
  || /^Download finished/.test(document.querySelector('#logs-outcome')?.textContent ?? '')`

/** True once some of the file has come (a tenth), or the download is through. */
const HALF_WAY = `Number(document.querySelector('${ROW} [role="progressbar"]')?.getAttribute('aria-valuenow') ?? 0) >= 10
  || /^Download finished/.test(document.querySelector('#logs-outcome')?.textContent ?? '')`

/** True once the download was stopped. */
const STOPPED = `/^Download stopped\\./.test(document.querySelector('#logs-outcome')?.textContent ?? '')`

/** Presses Download until the download begins; the failure says what the page shows. */
async function startDownload(): Promise<void> {
  try {
    await pressUntil('#logs-download', BEGUN, 4)
  } catch {
    await waitOrExplain(BEGUN, 1000, 'the download did not begin')
  }
}

async function cancelIt(): Promise<void> {
  try {
    await pressUntil('#logs-cancel', STOPPED, 5)
  } catch {
    await waitOrExplain(STOPPED, 1000, 'the download was not stopped by Cancel')
  }
  expect(await stateOfFirst()).toBe('Not downloaded')
  expect(await window().evaluate<boolean>(`document.querySelector('${ROW} [role="progressbar"]') === null`)).toBe(true)
}

async function cancelsPartWay(): Promise<void> {
  await window().click(`${ROW} input[type="checkbox"]`)
  // The bar of the log being fetched is there, and so is Cancel; after it, nothing says "Downloading" or has a bar. On a link so
  // fast that the download is through before the bar is looked for, there is nothing to cancel: the check says so and goes on.
  await startDownload()
  // Part way: some of the file has come (a cancel before the first bytes leaves no part to go on from).
  await waitOrExplain(HALF_WAY, 60_000, 'the download made no progress')
  cancelled = await window().evaluate<boolean>(`document.querySelector('#logs-cancel') !== null`)

  if (cancelled) {
    await cancelIt()
  } else {
    console.warn('sitl-logs: the download was through before it could be cancelled; the cancel and resume checks are skipped')
  }
}

async function goesOn(): Promise<void> {
  await pressUntil('#logs-download', BEGUN, 4)
  const finished = `/^Download finished\\. Downloaded: 1$/.test(document.querySelector('#logs-outcome')?.textContent ?? '')`
  await waitOrExplain(finished, DOWNLOAD_MS, 'the download that goes on did not finish')
  const resumed = await window().evaluate<string>(`document.querySelector('${ROW} .logs-resumed')?.textContent ?? ''`)
  expect(resumed).toMatch(/^Went on from /u)
}

/**
 * The vehicle's own file of the first log, in SITL's folder.
 *
 * @returns its path
 */
const theirsPath = () => join(sitl?.directory ?? '', 'logs', '00000001.BIN')

/** The copy in the app's folder is the vehicle's file, byte for byte as long as it is (it may have grown since). */
function checkTheCopy(): void {
  const copy = copyIn(home)
  const mine = readFileSync(copy)
  const theirs = readFileSync(theirsPath())
  expect(mine.length).toBeGreaterThan(100_000)
  expect(mine.length).toBeLessThanOrEqual(theirs.length)
  expect(mine.equals(theirs.subarray(0, mine.length))).toBe(true)
  expect(statSync(join(dirname(copy), '00000001.BIN.part'), { throwIfNoEntry: false })).toBeUndefined()
}

async function goesOnAndChecksIt(): Promise<void> {
  // The part is kept: the next download says it went on from what came before (unless the first one was through already).
  if (cancelled) {
    await goesOn()
  }
  expect(await stateOfFirst()).toBe('Downloaded')
  checkTheCopy()
}

async function offersNothingMore(): Promise<void> {
  // Everything is downloaded: a download of nothing new is not offered.
  await waitOrExplain(`document.querySelector('#logs-download')?.disabled === true`, 5000, 'Download is still offered')
}

describeSitl(
  'the logs of the vehicle (SITL)',
  () => {
    beforeAll(startAll, STARTUP_MS)
    afterAll(stopAll, 60_000)

    it('lists the log of a flight in "On the vehicle"', listsTheLogOfTheFlight, FLIGHT_MS)
    it('can be cancelled part way, keeping what came', cancelsPartWay, DOWNLOAD_MS + 30_000)
    it('goes on from there, and the vehicle checks the copy, which is its file', goesOnAndChecksIt, DOWNLOAD_MS + 30_000)
    it('offers nothing to download when everything is downloaded', offersNothingMore)
  },
  { launchOnly: true },
)
