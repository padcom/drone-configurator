import { expect, it } from 'vitest'
import type { LogsProgress, VehicleLog } from '@/generated/app'
import { formatFor } from '@/i18n/useFormat'
import { blockedBy, madeAt, notChecked, percentOf, sizeText, stateOf, undownloadedIds, usedBytes } from './vehicleLogs'

const EN = formatFor('en').number
const DE = formatFor('de').number
const NEW: VehicleLog = { id: 1, size: 1000, time: 1_783_000_000_000, downloaded: false }
const FETCHED: VehicleLog = { id: 2, size: 500, downloaded: true }
const LOGS: VehicleLog[] = [NEW, FETCHED, { id: 3, size: 250, downloaded: false }]

it('allows the logs only when a vehicle is known to be disarmed and nothing is downloading', () => {
  expect(blockedBy(true, false, false)).toBeNull()
  expect(blockedBy(false, false, false)).toBe('offline')
  expect(blockedBy(true, true, false)).toBe('armed')
  expect(blockedBy(true, false, true)).toBe('busy')
})

it('counts a vehicle that is not known to be disarmed as armed: it is blocked, with its own reason', () => {
  expect(blockedBy(true, undefined, false)).toBe('unknown')
  expect(blockedBy(true, undefined, true)).toBe('unknown')
})

it('gives an armed vehicle the reason armed before busy', () => {
  expect(blockedBy(true, true, true)).toBe('armed')
})

it('says what a log is: what the download said of it, else downloaded or new', () => {
  const progress: LogsProgress = { id: 1, state: 'downloading', received: 10, total: 100 }

  expect(stateOf(NEW, progress)).toBe('downloading')
  expect(stateOf(NEW, undefined)).toBe('new')
  expect(stateOf(FETCHED, undefined)).toBe('downloaded')
  // A copy is here, but the vehicle's CRC could not be asked: not known, and it can still be downloaded.
  expect(stateOf({ ...NEW, unchecked: true }, undefined)).toBe('unchecked')
  expect(undownloadedIds([{ ...NEW, unchecked: true }])).toEqual([NEW.id])
})

it('lists the logs that are not downloaded, and sums the sizes listed', () => {
  expect(undownloadedIds(LOGS)).toEqual([1, 3])
  expect(usedBytes(LOGS)).toBe(1750)
  expect(usedBytes([])).toBe(0)
})

it('writes sizes for people: bytes, kB, MB and GB', () => {
  expect(sizeText(12, EN)).toBe('12 B')
  expect(sizeText(48_000, EN)).toBe('48 kB')
  expect(sizeText(1_200_000, EN)).toBe('1.2 MB')
  expect(sizeText(500_000_000, EN)).toBe('500 MB')
  expect(sizeText(2_000_000_000, EN)).toBe('2 GB')
})

it('writes the decimal sign of the language: 1,2 MB in German', () => {
  expect(sizeText(1_200_000, DE)).toBe('1,2 MB')
})

it('gives the percent of a log fetched, held to 0 to 100, and 0 for a log of no size or none yet', () => {
  expect(percentOf({ id: 1, state: 'downloading', received: 250, total: 1000 })).toBe(25)
  expect(percentOf({ id: 1, state: 'downloading', received: 5000, total: 1000 })).toBe(100)
  expect(percentOf({ id: 1, state: 'queued', received: 0, total: 0 })).toBe(0)
  expect(percentOf(undefined)).toBe(0)
})

it('gives the time a log was made, or none when the vehicle gave none', () => {
  expect(madeAt(NEW)?.getTime()).toBe(1_783_000_000_000)
  expect(madeAt(FETCHED)).toBeNull()
})

it('says a copy that came over the log protocol has no checksum, also when its download says it is done', () => {
  const copy: VehicleLog = { id: 4, size: 90, downloaded: false, noChecksum: true }

  expect(stateOf(copy, undefined)).toBe('noChecksum')
  expect(stateOf(copy, { id: 4, state: 'done', received: 90, total: 90 })).toBe('noChecksum')
  // While it is fetched again the row says so.
  expect(stateOf(copy, { id: 4, state: 'downloading', received: 9, total: 90 })).toBe('downloading')
})

it('does not offer a copy with no checksum for a download, and counts it among the logs with no checked copy', () => {
  const copy: VehicleLog = { id: 4, size: 90, downloaded: false, noChecksum: true }

  expect(undownloadedIds([...LOGS, copy])).toEqual([1, 3])
  expect(notChecked([...LOGS, copy])).toBe(3)
  expect(notChecked([FETCHED])).toBe(0)
  expect(notChecked([])).toBe(0)
})
