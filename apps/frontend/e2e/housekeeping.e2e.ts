// End to end, in the real window with the real backend and no vehicle: the housekeeping of the downloaded logs. Before the app
// starts, the library holds six copies of a vehicle's logs of different ages (the files' times are set), one of them (an old one)
// whose bytes do not have the CRC in its name, and an imported recording that is very old. When the settings have been read the
// backend removes by the retention the user chose (90 days; the defaults remove nothing): the old copies that verify, but never
// the newest 3 of the vehicle, never the one that does not verify, and never the recording. The page names what was removed (a
// toast) and the vehicle's logs page says what the last check did.
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { showScreen } from './click'
import { type E2eApp, home, launchApp } from './launch'
import { crc32 } from './mavlink-wire'

const DAY_S = 86400
const DATA = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')
const LIBRARY = join(DATA, 'logs')
const VEHICLE = join(LIBRARY, 'uid-test')

let app: E2eApp

/**
 * The name of the copy of log `n` with these bytes: the number and the CRC-32 in hex.
 *
 * @param n the number of the log
 * @param bytes what the copy holds
 * @param honest whether the name has the CRC of the bytes (else of other ones)
 * @returns the name
 */
function nameOf(n: number, bytes: Buffer, honest: boolean): string {
  const crc = honest ? crc32(bytes) : crc32(bytes) ^ 1

  return `${String(n).padStart(8, '0')}-${crc.toString(16).padStart(8, '0')}.BIN`
}

/**
 * Puts a file in the library with a time `days` ago.
 *
 * @param path where
 * @param bytes what it holds
 * @param days how old it is
 */
function put(path: string, bytes: Buffer, days: number): void {
  writeFileSync(path, bytes)
  const then = Date.now() / 1000 - days * DAY_S
  utimesSync(path, then, then)
}

/** Six copies: 1, 5, 100, 200, 300 and 400 days old; log 300 does not verify. And a recording of 500 days. */
function fillTheLibrary(): void {
  mkdirSync(VEHICLE, { recursive: true })
  mkdirSync(join(LIBRARY, 'imported'), { recursive: true })
  const ages = [[6, 1], [5, 5], [4, 100], [3, 200], [2, 300], [1, 400]] as const
  for (const [n, days] of ages) {
    const bytes = Buffer.from(`log ${n} of the test vehicle, ${'x'.repeat(200 * n)}`)
    put(join(VEHICLE, nameOf(n, bytes, n !== 2)), bytes, days)
  }
  put(join(LIBRARY, 'imported', '00000000-aaaaaaaa.tlog'), Buffer.from('a recording'), 500)
  // The parts of downloads that were stopped: one of 10 days that nobody went on from, and one of yesterday (kept: a download
  // can go on from it).
  put(join(VEHICLE, '00000007.BIN.part'), Buffer.from('half a log'), 10)
  put(join(VEHICLE, '00000008.BIN.part'), Buffer.from('half a log'), 1)
}

/**
 * The numbers of the logs that are left in the vehicle's folder.
 *
 * @returns the numbers, sorted
 */
function left(): number[] {
  return readdirSync(VEHICLE).filter(name => name.endsWith('.BIN')).map(name => Number(name.slice(0, 8))).sort((a, b) => a - b)
}

/**
 * The settings of a user who turned the removal on (90 days), and who has the values an earlier version kept while nothing acted
 * on them (30 days, 500 MB, auto-download on): those are not read, only the new keys are.
 */
function chooseNinetyDays(): void {
  mkdirSync(DATA, { recursive: true })
  const entries = [
    ['logs.removeAfterDays', '90'], ['logs.retentionDays', '30'], ['logs.sizeCapMb', '500'], ['logs.autoDownload', 'on'],
  ].map(([key, value]) => `{ "key": "${key}", "value": "${value}" }`)
  writeFileSync(join(DATA, 'settings.json'), `{ "version": 1, "ui": [${entries.join(', ')}] }\n`)
}

beforeAll(async () => {
  fillTheLibrary()
  chooseNinetyDays()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

it('removes the old copies that verify, and only those (not the newest 3, an unverified one, a recording)', async () => {
  await app.waitFor(`document.querySelector('.kit-toast') !== null`, 30_000)
  const toast = await app.evaluate<string>(`document.querySelector('.kit-toast').textContent`)

  // The newest 3 (logs 6, 5 and 4, though log 4 is 100 days old) stay; logs 3 (200 days) and 1 (400 days) are removed; log 2 is
  // 300 days old but does not verify, so it stays.
  expect(left()).toEqual([2, 4, 5, 6])
  // The part of 10 days is gone, the one of yesterday stays.
  expect(existsSync(join(VEHICLE, '00000007.BIN.part'))).toBe(false)
  expect(existsSync(join(VEHICLE, '00000008.BIN.part'))).toBe(true)
  expect(toast).toContain('Logs removed from this computer: 2 (log 3, 1)')
  expect(toast).toContain('older than 90 days')
  expect(existsSync(join(LIBRARY, 'imported', '00000000-aaaaaaaa.tlog'))).toBe(true)
})

it('says on the vehicle logs page what the last check did, and that one copy did not verify', async () => {
  await showScreen(app, 'logs')
  await app.click('a[href="#/logs/vehicle"]')
  await app.waitFor(`document.querySelector('#logs-housekeeping') !== null`)
  const line = await app.evaluate<string>(`document.querySelector('#logs-housekeeping').textContent`)

  expect(line).toContain('removed 2, kept 3 as the newest of their vehicle')
  expect(line).toContain('Left alone, not verified: 1')
})
