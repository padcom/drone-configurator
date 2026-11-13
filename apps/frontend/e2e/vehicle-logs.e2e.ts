// End to end, in the real window with the real backend and the simulated vehicle behind a TCP port (no SITL): the logs on the
// vehicle are listed, downloaded (the vehicle's own CRC checks each copy), one download goes on from a part that an earlier one
// left, and the erase takes every log, on the second press, only once each has a checked copy. The vehicle never arms (a download
// is refused while it is armed). The checks go on from one another: one app, one connection.
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chooseConnection, clickConnect, showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { crc32 } from './mavlink-wire'
import { TcpVehicle } from './tcp-vehicle'

const LIBRARY = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator', 'logs')
const ROWS = 'table.logs-table tbody tr'
const STATES = `${ROWS} .logs-state-text`
const OUTCOME = '#logs-outcome'
/** A download of a few hundred kilobytes over the simulated link. */
const DOWNLOAD_MS = 120_000

let vehicle: TcpVehicle | undefined
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
 * The folder the downloaded logs of the vehicle are in (the vehicle's identity names it; there is one).
 *
 * @returns its path
 */
function folder(): string {
  const name = readdirSync(LIBRARY).find(entry => entry !== 'imported')
  if (name === undefined) {
    throw new Error(`no vehicle folder in ${LIBRARY}`)
  }

  return join(LIBRARY, name)
}

/**
 * The checked copies in the folder: `NNNNNNNN-CCCCCCCC.BIN`.
 *
 * @returns the names, sorted
 */
function copies(): string[] {
  return readdirSync(folder()).filter(name => /^\d{8}-[\da-f]{8}\.BIN$/u.test(name)).sort()
}

/**
 * The words in the state column of each row.
 *
 * @returns one text for each row
 */
function states(): Promise<string[]> {
  return window().evaluate<string[]>(`[...document.querySelectorAll('${STATES}')].map(cell => cell.textContent.trim())`)
}

/**
 * Waits for the status line to say a download is over.
 *
 * @param pattern what it begins with
 */
async function waitForOutcome(pattern: string): Promise<void> {
  await window().waitFor(`/^${pattern}/.test(document.querySelector('${OUTCOME}')?.textContent ?? '')`, DOWNLOAD_MS)
}

/** Selects the logs that are not downloaded, and downloads them. */
async function downloadTheNew(): Promise<void> {
  await window().waitFor(`document.querySelector('${ROWS}') !== null`, 30_000)
  await window().click('#logs-select-new')
  await window().waitFor(`document.querySelector('#logs-download')?.disabled === false`, 10_000)
  await window().click('#logs-download')
}

beforeAll(async () => {
  vehicle = await TcpVehicle.start(true)
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
  await chooseConnection(app, { transport: 'tcp', host: '127.0.0.1', port: String(vehicle.port) })
  await clickConnect(app)
  await app.waitForText('#connection', 'connected · system', 60_000)
  await showScreen(app, 'logs')
  await app.click('a[href="#/logs/vehicle"]')
}, 180_000)

afterAll(async () => {
  try {
    await app?.close()
  } finally {
    vehicle?.stop()
  }
})

it('lists the three logs, none downloaded, and keeps the erase off, saying why', async () => {
  await window().waitFor(`document.querySelectorAll('${ROWS}').length === 3`, 60_000)

  expect(await states()).toEqual(['Not downloaded', 'Not downloaded', 'Not downloaded'])
  expect(await window().evaluate<boolean>(`document.querySelector('#logs-erase').disabled`)).toBe(true)
  expect(await window().evaluate<string>(`document.querySelector('.logs-erase p').textContent`)).toContain('3 of 3 do not')
  // The vehicle has file transfer: nothing is said of the log protocol.
  expect(await window().evaluate<boolean>(`document.querySelector('#logs-protocol') === null`)).toBe(true)
})

it('downloads all of them, each checked by the vehicle, and turns the erase on', async () => {
  await downloadTheNew()
  await waitForOutcome('Download finished')

  expect(await states()).toEqual(['Downloaded', 'Downloaded', 'Downloaded'])
  expect(copies()).toHaveLength(3)

  for (const name of copies()) {
    // The name has the CRC of the bytes: the vehicle's own CRC-32 of its file, which is the copy's.
    expect(name.slice(9, 17)).toBe(crc32(readFileSync(join(folder(), name))).toString(16).padStart(8, '0'))
  }
  await window().waitFor(`document.querySelector('#logs-erase')?.disabled === false`, 10_000)
})

it('goes on from the part that is left when a copy is lost, and gets the same bytes', async () => {
  const first = copies()[0] ?? ''
  const whole = readFileSync(join(folder(), first))
  // The first log is gone from here, but a part of it (a third) is left, as a stopped download leaves one.
  writeFileSync(join(folder(), '00000001.BIN.part'), whole.subarray(0, Math.floor(whole.length / 3)))
  rmSync(join(folder(), first))
  await window().click('#logs-refresh')
  await window().waitFor(`document.querySelectorAll('${ROWS}').length === 3`, 30_000)
  await window().waitFor(`document.querySelector('${STATES}')?.textContent.trim() === 'Not downloaded'`, 30_000)
  await downloadTheNew()
  await waitForOutcome('Download finished')

  expect(copies()).toContain(first)
  expect(readFileSync(join(folder(), first)).equals(whole)).toBe(true)
  expect(readdirSync(folder()).filter(name => name.endsWith('.part'))).toEqual([])
})

it('erases every log on the second press, which names the count, and keeps the copies here', async () => {
  const before = copies()
  await window().waitFor(`document.querySelector('#logs-erase')?.disabled === false`, 10_000)
  await window().click('#logs-erase')
  expect(await window().text('#logs-erase'))
    .toBe('Confirm: erase all logs from the vehicle: 3. Each has a checked copy on this computer.')
  // A second click at once is a double click, and is one press.
  await new Promise(resolve => {
    setTimeout(resolve, 1500)
  })
  await window().click('#logs-erase')
  await window().waitFor(`document.querySelector('${OUTCOME}')?.textContent === 'Erased from the vehicle: 3.'`, 60_000)

  await window().waitFor(`document.querySelectorAll('${ROWS}').length === 0`, 30_000)
  expect(copies()).toEqual(before)
  expect(statSync(join(folder(), before[0] ?? '')).size).toBeGreaterThan(0)
})
