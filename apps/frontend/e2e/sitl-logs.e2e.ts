// The logs of the vehicle, against ArduPilot SITL in the real window: after a flight (arm in GUIDED, take off, land, driven over
// SITL's second TCP port) the log is on the vehicle and "On the vehicle" lists it; it is downloaded with progress, cancelled and
// gone on with, and checked by the vehicle's CRC. The copy in the app's data folder is the vehicle's file, byte for byte. It
// launches its own SITL (at speedup 1: the vehicle's file transfer fails at higher ones), so it ignores SITL_ENDPOINT.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { csvRows, gpxPoints, isPlace, kmlPoints, savedFile } from './exported'
import { crc32 } from './mavlink-wire'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** The flight, and the app's connection and first list, may take this long. */
const FLIGHT_MS = 300_000
/** Everything before the first check: SITL starting (up to 60 s), the flight (up to 240 s), and the app launching. */
const STARTUP_MS = 420_000
/** A download of a log of some megabytes. */
const DOWNLOAD_MS = 180_000
/** The backend reading a log of some megabytes through, and the series and review that follow. */
const READ_MS = 180_000
/** The whole of opening the log in Flights: the list, the read, the charts. */
const OPEN_TEST_MS = READ_MS + 120_000
/** The first row of the table, and its parts. */
const ROW = 'table.logs-table tbody tr'
const STATE = `${ROW} .logs-state-text`
/** Where the exports of the checks go: the backend writes there instead of asking in a dialog (a test cannot click one). */
const SAVED = join(home, 'saved')

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
  // The raw IMU batches are on from the boot (a parameter that takes effect at one): the Spectrum is checked on this log.
  sitl = await startSitl({ vehicle: 'copter', defaultParams: { INS_LOG_BAT_MASK: 1 } })
  // The log is made at the arm: the flight comes first, and the app is connected after it. It is closed at the disarm: left open
  // (the default), the vehicle goes on writing a few bytes to it for as long as it runs, and its CRC is never the same twice.
  await sitl.setParam('LOG_FILE_DSRMROT', 1)
  await sitl.fly()
  await waitForTheLogToSettle(join(sitl.directory, 'logs', '00000001.BIN'))
  // The exports go to a folder (the backend's test chooser) instead of a dialog nobody can click.
  mkdirSync(SAVED, { recursive: true })
  process.env.DRONE_CONFIGURATOR_TEST_FILES = SAVED
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  const { transport, host, port } = sitl.endpoint
  await chooseConnection(app, { transport, host, port: String(port) })
}

async function stopAll(): Promise<void> {
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES

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
  // The name has the CRC the vehicle computes for its file (what the app compared before it gave the copy this name), and it is
  // the CRC of the bytes in the copy.
  const named = /-(?<crc>[0-9a-f]{8})\.BIN$/u.exec(copy)?.groups?.crc
  expect(named).toBe(crc32(mine).toString(16).padStart(8, '0'))

  if (mine.length === theirs.length) {
    expect(named).toBe(crc32(theirs).toString(16).padStart(8, '0'))
  }
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

/** The log is open in Flights, read through: the summary line is there, nothing is reading, and there is a review or a reason. */
const OPENED = `document.querySelector('.flight-detail[data-phase="ready"] .flight-summary') !== null
  && document.querySelector('.flight-reading') === null
  && (document.querySelector('.flight-finding') !== null || document.querySelector('#flights-not-verified') !== null)`

/** What the Flights page shows of the open log, as one object. */
const FLIGHT_FACTS = `JSON.stringify({
  summary: document.querySelector('.flight-summary')?.textContent ?? '',
  error: document.querySelector('#flights-error')?.textContent ?? '',
  notVerified: document.querySelector('#flights-not-verified') !== null,
  damaged: document.querySelector('#flights-damaged')?.textContent ?? '',
  modes: [...document.querySelectorAll('.flight-mode-name')].map(m => m.textContent),
  charts: [...document.querySelectorAll('figure.kit-chart')].map(c => ({
    title: c.querySelector('.chart-title')?.textContent ?? '',
    absent: c.classList.contains('absent'),
  })),
  findings: [...document.querySelectorAll('.flight-finding')].map(f =>
    [f.querySelector('.flight-level')?.textContent, f.querySelector('.flight-text')?.textContent].join(' ')),
})`

/** The facts of the Flights page. */
interface FlightFacts {
  error: string
  summary: string
  notVerified: boolean
  damaged: string
  modes: string[]
  charts: { title: string, absent: boolean }[]
  findings: string[]
}

/**
 * How many messages the summary line of the open log says.
 *
 * @param summary the line ("2:00 · 152,000 messages · ArduCopter ...")
 * @returns the number, NaN when the line does not say
 */
function messagesOf(summary: string): number {
  const said = /·\s*(?<count>[^·]+?)\s+messages/u.exec(summary)?.groups?.count ?? ''

  return Number(said.replaceAll(/\D/gu, ''))
}

/**
 * The real-log proof of the library of logs: the log the app downloaded from the CI-firmware SITL is opened in Flights, which
 * asks the backend to read it (the DataFlash reader over the 6 MB file), and the page says it is verified (its CRC is the
 * vehicle's), how many messages it has, its flight modes, what the charts hold, and the review. What the page shows is printed.
 */
async function opensTheDownloadedLogInFlights(): Promise<void> {
  await window().click('a[href="#/logs/flights"]')
  await waitOrExplain(`document.querySelectorAll('table.flights-table tbody tr').length >= 1`, 60_000, 'Flights lists no log')
  await pressUntil('.flights-open', `document.querySelector('.flight-detail') !== null`, 4)
  await waitOrExplain(OPENED, READ_MS, 'the log was not opened in Flights')
  // The page as the user sees it (a file to look at: the run prints where).
  const shot = join(tmpdir(), 'drone-configurator-flights.png')
  await window().screenshot(shot)
  console.info(`sitl-logs: screenshot of Flights: ${shot}`)

  const facts = JSON.parse(await window().evaluate<string>(FLIGHT_FACTS)) as FlightFacts
  console.info(`sitl-logs: Flights shows: ${JSON.stringify(facts, null, 2)}`)
  expect(facts.error).toBe('')
  expect(facts.notVerified).toBe(false)
  expect(messagesOf(facts.summary)).toBeGreaterThan(1000)
  expect(facts.summary).toContain('ArduCopter')
  // The log may end in the middle of a message (copied while the vehicle writes it): the page says so, and it is not damage.
  expect(facts.damaged).toBe('')
  // MODE is in the log: the strip has a mode, by name (the firmware is ArduCopter).
  expect(facts.modes.length).toBeGreaterThan(0)
  expect(facts.modes.every(name => name !== null && !/^Mode \d+$/u.test(name))).toBe(true)
  // ATT is in the log: the attitude chart has data.
  expect(facts.charts.find(chart => chart.title.startsWith('Attitude'))?.absent).toBe(false)
  // BAT is in the log too: the battery chart has data, with the unit the log names.
  const battery = facts.charts.find(chart => chart.title.startsWith('Battery'))
  expect(battery).toMatchObject({ absent: false, title: 'Battery voltage, V' })
  expect(facts.findings.length).toBe(11)
}

/**
 * Chooses a value of a select, as the user would.
 *
 * @param selector the select
 * @param value the option's value
 */
async function chooseIn(selector: string, value: string): Promise<void> {
  await window().evaluate(`(() => {
    const select = document.querySelector('${selector}')
    select.value = '${value}'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

/** What the export's status line says now. */
const EXPORT_SAYS = `(document.querySelector('#export-status')?.textContent ?? '')`

/**
 * Waits until the export's status line says a file was saved.
 *
 * @param extension the file's extension, with its dot ("-ATT.csv", ".gpx")
 * @param what what did not happen
 */
async function waitForSaved(extension: string, what: string): Promise<void> {
  const pattern = `^Saved .*${extension.replaceAll('.', '\\\\.')}: [\\\\d,]+ rows?$`
  await waitOrExplain(`new RegExp('${pattern}').test(${EXPORT_SAYS})`, 120_000, what)
}

/** The kinds of message the vehicle wrote are listed, and the fields of ATT are shown at the end of the log, with the unit. */
async function listsTheKindsAndShowsTheFields(): Promise<void> {
  await waitOrExplain(`document.querySelector('#browser-kind') !== null`, 60_000, 'the message browser is not there')
  const options = `[...document.querySelectorAll('#browser-kind option')].map(option => option.value)`
  const kinds = await window().evaluate<string[]>(options)
  console.info(`sitl-logs: the kinds of message: ${kinds.join(' ')}`)
  expect(kinds).toEqual(expect.arrayContaining(['ATT', 'BAT', 'GPS', 'MODE']))

  await chooseIn('#browser-kind', 'ATT')
  // End on the slider over the first chart: the cursor goes to the end of the log, and the browser asks for ATT there.
  await window().evaluate(`(() => {
    const slider = document.querySelector('.kit-chart .chart-cursor-control')
    slider.focus()
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
  })()`)
  const roll = `document.querySelector('[data-field="Roll"] .browser-value')?.textContent.endsWith(' deg')`
  await waitOrExplain(roll, 60_000, 'no Roll with its unit at the cursor')
}

/** A field that is pressed is charted, with the unit the log names. */
async function chartsAFieldThatIsPressed(): Promise<void> {
  await window().click('[data-field="Roll"] .browser-graph')
  const charted = `[...document.querySelectorAll('.chart-title')].some(title => title.textContent === 'ATT.Roll, deg')`
  await waitOrExplain(charted, 60_000, 'Roll was not charted')
}

/**
 * The number of rows the export's status line says were written.
 *
 * @param said the line ("Saved x-ATT.csv: 12,000 rows")
 * @returns the number, NaN when the line does not say
 */
function rowsSaid(said: string): number {
  return Number(/: (?<count>[\d,]+) rows?$/u.exec(said)?.groups?.count?.replaceAll(',', ''))
}

/** ATT is exported as CSV, and the file is read back by a reader that is not the exporter's. */
async function exportsACsvThatIsReadBack(): Promise<void> {
  await window().click('#export-csv')
  await waitForSaved('-ATT.csv', 'no CSV was saved')
  const rows = csvRows(savedFile(SAVED, '-ATT.csv') ?? '')
  const [header = []] = rows

  // The log names seconds as the unit of TimeUS.
  expect(header[0]).toBe('TimeUS (s)')
  expect(header).toContain('Roll (deg)')
  expect(rows.length).toBeGreaterThan(100)
  expect(rows.every(row => row.length === header.length)).toBe(true)
  expect(rowsSaid(await window().evaluate<string>(EXPORT_SAYS))).toBe(rows.length - 1)
}

/** The same export again names the file and writes nothing; a second press that names it replaces it. */
async function doesNotReplaceTheFileWithoutASecondPress(): Promise<void> {
  const before = statSync(savedFile(SAVED, '-ATT.csv') ?? '').mtimeMs
  await window().click('#export-csv')
  await waitOrExplain(`document.querySelector('#export-replace') !== null`, 120_000, 'the file that is there was not named')
  expect(await window().evaluate<string>(EXPORT_SAYS)).toMatch(/-ATT\.csv already exists\. Nothing was written\.$/u)
  expect(statSync(savedFile(SAVED, '-ATT.csv') ?? '').mtimeMs).toBe(before)

  await window().click('#export-replace')
  expect(await window().text('#export-replace')).toMatch(/^Confirm: replace .*-ATT\.csv$/u)
  await pause(500)
  await window().click('#export-replace')
  await waitForSaved('-ATT.csv', 'the file was not replaced')
  expect(statSync(savedFile(SAVED, '-ATT.csv') ?? '').mtimeMs).toBeGreaterThan(before)
}

/** The GPS track is exported as GPX and KML that parse, with the same points. */
async function exportsTheTrackThatParses(): Promise<void> {
  await window().click('#export-gpx')
  await waitForSaved('.gpx', 'no GPX was saved')
  await window().click('#export-kml')
  await waitForSaved('.kml', 'no KML was saved')
  const gpx = gpxPoints(readFileSync(savedFile(SAVED, '.gpx') ?? '', 'utf8'))
  const kml = kmlPoints(readFileSync(savedFile(SAVED, '.kml') ?? '', 'utf8'))
  console.info(`sitl-logs: the track has ${gpx.length} points; the exports: ${readdirSync(SAVED).join(', ')}`)

  expect(gpx.length).toBeGreaterThan(10)
  expect(gpx.every(isPlace)).toBe(true)
  // KML is longitude then latitude, and the same points in the same order.
  expect(kml).toEqual(gpx)
}

/** The Spectrum has made something, or said why not. */
const SPECTRUM_DONE = `document.querySelectorAll('.spectrum-chart, #spectrum-none, #spectrum-silent, #spectrum-error').length > 0`

/** What the Spectrum page shows, as one object. */
const SPECTRUM_FACTS = `JSON.stringify({
  none: document.querySelector('#spectrum-none') !== null,
  silent: document.querySelector('#spectrum-silent') !== null,
  error: document.querySelector('#spectrum-error')?.textContent ?? '',
  chart: document.querySelector('.spectrum-chart svg')?.getAttribute('aria-label') ?? '',
  facts: document.querySelector('.spectrum-facts')?.textContent ?? '',
  sources: [...document.querySelectorAll('#spectrum-source option')].map(option => option.textContent),
  peak: [...document.querySelectorAll('.spectrum-peak tbody tr')].map(row => row.textContent),
  spectrogram: document.querySelector('.spectrogram canvas')?.getAttribute('aria-label') ?? '',
})`

/**
 * The Spectrum of the real log: the CI-firmware vehicle was started with the raw IMU batches on (INS_LOG_BAT_MASK), so the log
 * the app downloaded holds ISBH and ISBD. The log is opened in Spectrum, which reads it, lists its batches and makes the
 * spectrum of the first gyro. What the page shows is printed, with a screenshot. The vehicle sits and flies a little, so the
 * check is that there is a spectrum of batches that were whole (not that it has a particular peak).
 */
async function opensTheSpectrumOfTheRealLog(): Promise<void> {
  await window().click('a[href="#/logs/spectrum"]')
  await waitOrExplain(`document.querySelectorAll('#spectrum-log option').length >= 2`, 60_000, 'Spectrum lists no log')
  const key = await window().evaluate<string>(`document.querySelectorAll('#spectrum-log option')[1].value`)
  await chooseIn('#spectrum-log', key)
  await waitOrExplain(SPECTRUM_DONE, READ_MS, 'the spectrum was not made')
  const shot = join(tmpdir(), 'drone-configurator-spectrum.png')
  await window().screenshot(shot)
  const facts = JSON.parse(await window().evaluate<string>(SPECTRUM_FACTS)) as Record<string, unknown>
  console.info(`sitl-logs: screenshot of Spectrum: ${shot}; Spectrum shows: ${JSON.stringify(facts, null, 2)}`)

  expect(facts.error).toBe('')
  expect(facts.none).toBe(false)
  expect(String(facts.facts)).toMatch(/^\d+ batches used/u)
  expect(Number(/^(?<count>\d+) batches/u.exec(String(facts.facts))?.groups?.count)).toBeGreaterThan(5)
  expect(String(facts.spectrogram)).toContain('rows')
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
    it('opens the downloaded log in Flights: verified, its modes, charts, review', opensTheDownloadedLogInFlights, OPEN_TEST_MS)
    it('lists the kinds of message and shows the fields of ATT at the cursor', listsTheKindsAndShowsTheFields, READ_MS)
    it('charts a field that is pressed', chartsAFieldThatIsPressed, READ_MS)
    it('exports ATT as a CSV that a reader reads back', exportsACsvThatIsReadBack, READ_MS)
    it('does not replace a file without a second press that names it', doesNotReplaceTheFileWithoutASecondPress, READ_MS)
    it('exports the GPS track as GPX and KML that parse', exportsTheTrackThatParses, READ_MS)
    it('makes the spectrum of the raw IMU batches of the real log', opensTheSpectrumOfTheRealLog, READ_MS)
  },
  { launchOnly: true },
)
