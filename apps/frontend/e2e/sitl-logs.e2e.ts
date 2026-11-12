// The logs of the vehicle, against ArduPilot SITL in the real window: after a flight (arm in GUIDED, take off, land, driven over
// SITL's second TCP port) the log is on the vehicle and "On the vehicle" lists it; it is downloaded with progress, cancelled and
// gone on with, and checked by the vehicle's CRC. The copy in the app's data folder is the vehicle's file, byte for byte. It
// launches its own SITL (at speedup 1: the vehicle's file transfer fails at higher ones), so it ignores SITL_ENDPOINT.
//
// The checks go on from one another (one app, one connection): if the first fails, the rest fail for that reason.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** The flight, and the app's connection and first list, may take this long. */
const FLIGHT_MS = 300_000
/** A download of a log of some megabytes. */
const DOWNLOAD_MS = 180_000
/** The first row of the table, and its parts. */
const ROW = 'table.logs-table tbody tr'
const STATE = `${ROW} .logs-state-text`

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
 * The copy of the first log in the app's data folder: `<data>/.../logs/<vehicle>/00000001.BIN`.
 *
 * @param dir the folder to look in
 * @returns its path, undefined when there is none
 */
function copyIn(dir: string): string | undefined {
  const found = readdirSync(dir, { recursive: true }).map(String)
    .find(path => path.includes(`logs${sep}`) && path.endsWith(`${sep}00000001.BIN`))

  return found === undefined ? undefined : join(dir, found)
}

/**
 * The text of the state cell of the first log.
 *
 * @returns its text, '' when it is not there
 */
const stateOfFirst = () => window().evaluate<string>(`document.querySelector('${STATE}')?.textContent ?? ''`)

async function startAll(): Promise<void> {
  sitl = await startSitl({ vehicle: 'copter' })
  // The log is made at the arm: the flight comes first, and the app is connected after it.
  await sitl.fly()
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

async function listsTheLogOfTheFlight(): Promise<void> {
  await clickConnect(window())
  await window().waitForText('#connection', 'connected · system', 60_000)
  await showScreen(window(), 'logs')
  await window().click('a[href="#/logs/vehicle"]')
  await window().waitFor(`document.querySelectorAll('${ROW}').length >= 1`, 60_000)

  // It is a log of 8 digits, the first, with a time (the last write: SITL's files have one), not downloaded, and nothing was
  // downloaded on its own.
  expect(await window().text(`${ROW} th`)).toBe('1')
  expect(await window().text(`${ROW} td:nth-child(3)`)).not.toBe('No date')
  expect(await stateOfFirst()).toBe('Not downloaded')
  expect(await window().evaluate<boolean>(`document.querySelector('#logs-erase')?.disabled === true`)).toBe(true)
}

async function cancelsPartWay(): Promise<void> {
  await window().click(`${ROW} input[type="checkbox"]`)
  await window().click('#logs-download')
  // The bar of the log being fetched is there, and so is Cancel; after it, nothing says "Downloading" or has a bar.
  await window().waitFor(`document.querySelector('${ROW} [role="progressbar"]') !== null`, DOWNLOAD_MS)
  await window().click('#logs-cancel')
  await window().waitForText('#logs-outcome', /^Download stopped\./u, DOWNLOAD_MS)
  expect(await stateOfFirst()).toBe('Not downloaded')
  expect(await window().evaluate<boolean>(`document.querySelector('${ROW} [role="progressbar"]') === null`)).toBe(true)
}

async function goesOnAndChecksIt(): Promise<void> {
  // The part is kept: the next download says it went on from what came before.
  await window().click('#logs-download')
  await window().waitForText('#logs-outcome', /^Download finished\. Downloaded: 1$/u, DOWNLOAD_MS)
  expect(await stateOfFirst()).toBe('Downloaded')
  const resumed = await window().evaluate<string>(`document.querySelector('${ROW} .logs-resumed')?.textContent ?? ''`)
  expect(resumed).toMatch(/^Went on from /u)

  // The copy is the vehicle's file: as long as it is, byte for byte (the vehicle may have written more since).
  const copy = copyIn(home)
  expect(copy).toBeDefined()
  const mine = readFileSync(copy ?? '')
  const theirs = readFileSync(join(sitl?.directory ?? '', 'logs', '00000001.BIN'))
  expect(mine.length).toBeGreaterThan(100_000)
  expect(mine.length).toBeLessThanOrEqual(theirs.length)
  expect(mine.equals(theirs.subarray(0, mine.length))).toBe(true)
  expect(statSync(`${copy}.part`, { throwIfNoEntry: false })).toBeUndefined()
}

async function offersNothingMore(): Promise<void> {
  // Everything is downloaded: a download of nothing new is not offered.
  expect(await window().evaluate<boolean>(`document.querySelector('#logs-download')?.disabled === true`)).toBe(true)
}

describeSitl(
  'the logs of the vehicle (SITL)',
  () => {
    beforeAll(startAll, FLIGHT_MS)
    afterAll(stopAll, 60_000)

    it('lists the log of a flight in "On the vehicle"', listsTheLogOfTheFlight, FLIGHT_MS)
    it('can be cancelled part way, keeping what came', cancelsPartWay, DOWNLOAD_MS + 30_000)
    it('goes on from there, and the vehicle checks the copy, which is its file', goesOnAndChecksIt, DOWNLOAD_MS + 30_000)
    it('offers nothing to download when everything is downloaded', offersNothingMore)
  },
  { launchOnly: true },
)
