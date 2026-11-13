// End to end, in the real window with the real backend and no vehicle: with the settings as they are on a new or an
// existing install (Never and No limit), NOTHING is removed, whatever the age of the copies, and not a stale part of a download either: the
// housekeeping asks the backend, which removes nothing without a rule, and no toast says otherwise.
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { type E2eApp, home, launchApp } from './launch'
import { crc32 } from './mavlink-wire'

const DAY_S = 86400
const DATA = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')
const VEHICLE = join(DATA, 'logs', 'uid-test')

let app: E2eApp

/**
 * Puts a file in the library with a time `days` ago.
 *
 * @param name its name
 * @param bytes what it holds
 * @param days how old it is
 */
function put(name: string, bytes: Buffer, days: number): void {
  const path = join(VEHICLE, name)
  writeFileSync(path, bytes)
  const then = Date.now() / 1000 - days * DAY_S
  utimesSync(path, then, then)
}

/** Six copies of 1 to 600 days, and a part of a download of 30 days: with the values an earlier version kept (not read). */
function fillTheLibrary(): void {
  mkdirSync(VEHICLE, { recursive: true })

  for (const [n, days] of [[6, 1], [5, 100], [4, 200], [3, 300], [2, 400], [1, 600]] as const) {
    const bytes = Buffer.from(`log ${n} ${'x'.repeat(100 * n)}`)
    put(`${String(n).padStart(8, '0')}-${crc32(bytes).toString(16).padStart(8, '0')}.BIN`, bytes, days)
  }
  put('00000007.BIN.part', Buffer.from('half a log'), 30)
  // What an earlier version kept while nothing acted on it: it was never a choice to remove files, and is not read.
  writeFileSync(
    join(DATA, 'settings.json'),
    '{ "version": 1, "ui": [ { "key": "logs.retentionDays", "value": "30" }, { "key": "logs.sizeCapMb", "value": "500" } ] }\n',
  )
}

beforeAll(async () => {
  fillTheLibrary()
  app = await launchApp()
  await app.waitForText('#connection', 'disconnected')
})

afterAll(async () => {
  await app?.close()
})

it('removes nothing under Never and No limit: no copy, no stale part, and says nothing', async () => {
  // Long enough for the housekeeping that runs when the settings have been read.
  await new Promise(resolve => {
    setTimeout(resolve, 3000)
  })

  expect(readdirSync(VEHICLE)).toHaveLength(7)
  expect(existsSync(join(VEHICLE, '00000007.BIN.part'))).toBe(true)
  expect(await app.evaluate<number>(`document.querySelectorAll('.kit-toast').length`)).toBe(0)
})
