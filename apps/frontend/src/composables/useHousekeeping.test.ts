// The housekeeping of the downloaded logs: it says what it removed, naming the logs and why; "not now" (the vehicle may be
// flying, a download runs) is quiet; other failures are told once; two runs never overlap.
import { expect, it } from 'vitest'
import { BackendError, type BackendClient } from '@/backend/client'
import type { LogsHousekept } from '@/generated/app'
import { logsPrefsOf } from '@/lib/logs/logsPrefs'
import type { ToastInput } from './toasts'
import { numberOf, removedText, useHousekeeping } from './useHousekeeping'

const NONE: LogsHousekept = { removed: [], removedCount: 0, freed: 0, kept: 3, unverified: 0, overCap: false }

/**
 * A housekeeping over a backend that answers as given.
 *
 * @param answer what `logs.housekeeping` does
 * @returns the housekeeping, what the user was told and the asks the backend got
 */
function setup(answer: () => Promise<LogsHousekept>) {
  const told: ToastInput[] = []
  const asks: unknown[] = []
  const client = {
    call: (_name: string, ask: unknown) => {
      asks.push(ask)

      return answer()
    },
  } as unknown as BackendClient
  const prefs = () => ({ retentionDays: 90, sizeCapMb: 2000 })
  const model = useHousekeeping({ client, prefs, tell: input => told.push(input) })

  return { model, told, asks }
}

it('gives the number of a log from the name of its copy', () => {
  expect(numberOf('00000012-1a2b3c4d.BIN')).toBe('12')
  expect(numberOf('00000103-00000000.BIN')).toBe('103')
})

it('asks with the preferences and says what was removed, naming the logs and why', async () => {
  const removed = [
    { vehicle: 'v', name: '00000003-aaaaaaaa.BIN', size: 100, why: 'age' as const },
    { vehicle: 'v', name: '00000004-bbbbbbbb.BIN', size: 100, why: 'age' as const },
  ]
  const t = setup(() => Promise.resolve({ ...NONE, removed, removedCount: 2, freed: 200 }))
  await t.model.run()

  expect(t.asks).toEqual([{ retentionDays: 90, sizeCapMb: 2000 }])
  expect(t.told).toHaveLength(1)
  expect(t.told[0]?.text).toBe('Logs removed from this computer: 2 (log 3, 4). Why: they were older than 90 days.')
  expect(t.model.last.value?.removedCount).toBe(2)
})

it('names five logs and counts the rest, and says both reasons when there are two', () => {
  const removed = Array.from({ length: 7 }, (_, i) => ({
    vehicle: 'v', name: `0000000${i + 1}-aaaaaaaa.BIN`, size: 1, why: i < 3 ? 'age' as const : 'size' as const,
  }))
  const text = removedText({ ...NONE, removed, removedCount: 9 }, 90, 2000)

  expect(text).toContain('log 1, 2, 3, 4, 5; others: 4')
  expect(text).toContain('older than 90 days, or the downloaded logs took more than 2000 MB')
})

it('says nothing when nothing was removed, and keeps the result for the page', async () => {
  const t = setup(() => Promise.resolve(NONE))
  await t.model.run()

  expect(t.told).toHaveLength(0)
  expect(t.model.last.value).toEqual(NONE)
})

it('is quiet when the vehicle is armed, not known, or a download runs: it asks again next time', async () => {
  for (const code of ['ARMED', 'STATE_UNKNOWN', 'BUSY', 'UNKNOWN_METHOD']) {
    const t = setup(() => Promise.reject(new BackendError(code, 'not now')))
    // eslint-disable-next-line no-await-in-loop -- one backend after the other
    await t.model.run()

    expect(t.told).toHaveLength(0)
    expect(t.model.last.value).toBeNull()
  }
})

it('tells another failure, once, with the reason', async () => {
  const t = setup(() => Promise.reject(new BackendError('NO_STORAGE', "can't use the folder for logs")))
  await t.model.run()

  expect(t.told).toHaveLength(1)
  expect(t.told[0]).toMatchObject({ severity: 'warning' })
  expect(t.told[0]?.text).toContain("can't use the folder")
})

it('does not overlap: a run asked for while one is going on is not sent', async () => {
  let release: (done: LogsHousekept) => void = () => undefined
  const t = setup(() => new Promise<LogsHousekept>(resolve => {
    release = resolve
  }))
  const first = t.model.run()
  await t.model.run()
  release(NONE)
  await first

  expect(t.asks).toHaveLength(1)
})

it('reads the preferences from the settings: the defaults, and 0 for never and no limit', () => {
  expect(logsPrefsOf(() => undefined)).toEqual({ retentionDays: 90, sizeCapMb: 2000, autoDownload: false })
  const values: Record<string, string> = { 'logs.retentionDays': '0', 'logs.sizeCapMb': '0', 'logs.autoDownload': 'on' }

  expect(logsPrefsOf(key => values[key])).toEqual({ retentionDays: 0, sizeCapMb: 0, autoDownload: true })
  // What is not one of the choices is the default (a hand-edited file cannot make a retention of 1 day).
  expect(logsPrefsOf(() => '1')).toMatchObject({ retentionDays: 90, sizeCapMb: 2000 })
})
