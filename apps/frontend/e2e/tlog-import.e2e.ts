// End to end, in the real window with the real backend, no vehicle: "Open log file…" imports a ground station's
// recording. The file is the `mav.tlog` that MAVProxy wrote from the CI-firmware SITL (pico-mavlink's
// src/fixtures/mavproxy.tlog, a sibling of this repository, the one the dependency is taken from); the backend's test chooser
// (DRONE_CONFIGURATOR_TEST_FILES) gives it as `import.tlog` instead of a native dialog nobody can click. The page opens it in
// Flights with the mark that it was not checked against a vehicle, the reader's report, the modes, the charts and the review;
// the same file again is the entry that is there; the palette has the command; the Spectrum tab says a recording has no raw
// IMU batches.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { chord, openPalette } from './palette-keys'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, '../../../../pico-mavlink/src/fixtures/mavproxy.tlog')
const CHOSEN = join(tmpdir(), `drone-configurator-tlog-e2e-${process.pid}`)

let app: E2eApp

/** What Flights shows of the open log, as the page says it. */
const FACTS = `JSON.stringify({
  title: document.querySelector('.flight-detail-title')?.textContent ?? '',
  mark: document.querySelector('#flights-imported-mark')?.textContent ?? '',
  report: document.querySelector('#flights-report')?.textContent ?? '',
  status: document.querySelector('#flights-status')?.textContent ?? '',
  summary: document.querySelector('.flight-summary')?.textContent ?? '',
  charts: [...document.querySelectorAll('figure.kit-chart .chart-title')].map(t => t.textContent),
  modes: [...document.querySelectorAll('.flight-mode-name')].map(t => t.textContent),
  findings: [...document.querySelectorAll('.flight-finding')].map(f => f.textContent),
  rows: [...document.querySelectorAll('table.flights-table tbody tr')].map(r => r.textContent),
  error: document.querySelector('#flights-error')?.textContent ?? '',
})`

interface Facts {
  title: string
  mark: string
  report: string
  status: string
  summary: string
  charts: string[]
  modes: string[]
  findings: string[]
  rows: string[]
  error: string
}

/**
 * What the page shows now.
 *
 * @returns the facts
 */
async function facts(): Promise<Facts> {
  return JSON.parse(await app.evaluate<string>(FACTS)) as Facts
}

/** Waits until the log that was imported is open and loaded (no progress bar, a review). */
async function waitForLoaded(): Promise<void> {
  await app.waitFor(`document.querySelector('.flight-detail') !== null && document.querySelector('.flight-reading') === null
    && document.querySelector('.flight-finding') !== null`, 60_000)
}

/** Starts the app with the recording to choose, and shows Flights. */
async function startApp(): Promise<void> {
  mkdirSync(CHOSEN, { recursive: true })
  copyFileSync(FIXTURE, join(CHOSEN, 'import.tlog'))
  process.env.DRONE_CONFIGURATOR_TEST_FILES = CHOSEN
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await showScreen(app, 'logs')
  await app.click('a[href="#/logs/flights"]')
  await app.waitFor(`document.querySelector('#flights-import') !== null`)
}

beforeAll(startApp)

afterAll(async () => {
  delete process.env.DRONE_CONFIGURATOR_TEST_FILES
  await app?.close()
})

/** Imports the recording and checks what Flights shows of it. */
async function importsAndOpensTheRecording(): Promise<void> {
  await app.click('#flights-import')
  await waitForLoaded()
  const shown = await facts()
  console.info(`tlog-import: Flights shows: ${JSON.stringify(shown, null, 2)}`)

  expect(shown.error).toBe('')
  expect(shown.title).toBe('Imported log file #0')
  expect(shown.mark).toContain('not checked against a vehicle')
  expect(shown.status).toBe('Imported import.tlog and opened it.')
  // 2480 records, nothing damaged, ends at a record boundary.
  expect(shown.report).toContain('Records read: 2,480.')
  expect(shown.report).toContain('Skipped: 0 bytes of damage, 0 frames with a wrong checksum')
  expect(shown.summary).toContain('ArduCopter')
  expect(shown.charts).toHaveLength(4)
  expect(shown.modes.length).toBeGreaterThan(0)
  expect(shown.rows[0]).toContain('Imported #0')
  expect(shown.rows[0]).toContain('Imported, copy intact')
}

/** The review says no data for what a recording cannot say. */
async function reviewsWithNoData(): Promise<void> {
  const shown = await facts()

  expect(shown.findings.length).toBeGreaterThan(5)
  expect(shown.findings.some(line => line.toLowerCase().includes('no data'))).toBe(true)
}

/**
 * The files of the library of imported recordings (the app keeps its data under the e2e home).
 *
 * @returns their names, sorted
 */
function importedFiles(): string[] {
  return readdirSync(home, { recursive: true }).map(String).filter(path => /[\\/]logs[\\/]imported[\\/][^\\/]+$/u.test(path))
    .map(path => path.slice(path.lastIndexOf(sep) + 1)).sort()
}

/** The library holds the copy and its sidecar, nothing else. */
function keepsTheCopyAndItsSidecar(): void {
  const files = importedFiles()

  expect(files).toHaveLength(2)
  expect(files[0]).toMatch(/^00000000-[0-9a-f]{8}\.tlog$/u)
  expect(files[1]).toBe(`${files[0]}.json`)
}

/** The same file again is the entry that is there. */
async function takesTheSameFileAsTheEntryThatIsThere(): Promise<void> {
  await app.click('#flights-import')
  await app.waitFor(`document.querySelector('#flights-status')?.textContent.includes('already')`, 60_000)
  await waitForLoaded()

  expect(importedFiles()).toHaveLength(2)
  expect((await facts()).rows.filter(row => row.includes('Imported #'))).toHaveLength(1)
}

/** The palette has the command. */
async function hasThePaletteCommand(): Promise<void> {
  await openPalette(app)
  const rows = await app.evaluate<string[]>(`[...document.querySelectorAll('.palette-row')].map(row => row.dataset.command)`)

  expect(rows).toContain('logs.openFile')
}

/** The Spectrum tab says a recording has no raw IMU batches. */
async function saysOnTheSpectrumTabThatARecordingHasNoBatches(): Promise<void> {
  await chord(app, 'Escape')
  await app.waitFor(`document.querySelector('#palette-input') === null`)
  await app.click('a[href="#/logs/spectrum"]')
  await app.waitFor(`document.querySelector('#spectrum-tlog') !== null`)
  const said = await app.evaluate<string>(`document.querySelector('#spectrum-tlog').textContent`)

  expect(said).toContain('Not available for a log file')
}

it('imports the recording MAVProxy wrote and opens it, marked as not checked against a vehicle', importsAndOpensTheRecording)
it('has the review with no data for what a recording cannot say', reviewsWithNoData)
it('writes the copy and its sidecar to the library, and nothing else', keepsTheCopyAndItsSidecar)
it('takes the same file again as the entry that is there', takesTheSameFileAsTheEntryThatIsThere)
it('is a command of the palette', hasThePaletteCommand)
it('says on the Spectrum tab that a recording has no raw IMU batches', saysOnTheSpectrumTabThatARecordingHasNoBatches)
