// The logs of the mock vehicle on their own: what the backend will do, as far as the contract draft says.
import { afterEach, expect, it, vi } from 'vitest'
import type { Envelope } from '@pico-desktop/protocol'
import { MOCK_LOGS, MockLogs } from './mock-logs'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A mock vehicle's logs, with what it sent and answered collected.
 *
 * @param armed what the armed state is
 * @returns the logs and what they said
 */
function logsOf(armed: boolean | null | undefined) {
  vi.useFakeTimers()
  const events: Record<string, unknown>[] = []
  const replies: unknown[] = []
  const errors: string[] = []
  const logs = new MockLogs(e => events.push(e.p as Record<string, unknown>), { steps: 2, intervalMs: 10 }, () => armed)

  return {
    logs,
    events,
    replies,
    errors,
    ok: (p: Envelope['p']) => replies.push(p),
    fail: (code: string) => errors.push(code),
  }
}

it('refuses to download or erase while armed, or while it is not known that the vehicle is disarmed', () => {
  const armed = logsOf(true)
  const unknown = logsOf(undefined)
  armed.logs.download([1], armed.ok, armed.fail)
  armed.logs.erase(armed.ok, armed.fail)
  unknown.logs.download([1], unknown.ok, unknown.fail)
  unknown.logs.erase(unknown.ok, unknown.fail)

  expect(armed.errors).toEqual(['ARMED', 'ARMED'])
  expect(unknown.errors).toEqual(['STATE_UNKNOWN', 'STATE_UNKNOWN'])
  expect(armed.events).toEqual([])
  expect(armed.replies).toEqual([])
})

it('refuses a second download and an erase while one runs', () => {
  const run = logsOf(false)
  run.logs.download([1], run.ok, run.fail)
  run.logs.download([2], run.ok, run.fail)
  run.logs.erase(run.ok, run.fail)

  expect(run.errors).toEqual(['BUSY', 'BUSY'])
})

it('downloads the logs asked for, one after the other, each queued first, and answers when all are whole', () => {
  const run = logsOf(false)
  run.logs.download([1, 2], run.ok, run.fail)

  expect(run.events.map(e => [e.id, e.state])).toEqual([[1, 'queued'], [2, 'queued']])
  vi.advanceTimersByTime(40)

  expect(run.events.slice(2).map(e => [e.id, e.state]))
    .toEqual([[1, 'downloading'], [1, 'done'], [2, 'downloading'], [2, 'done']])
  expect(run.replies).toEqual([{ ids: [1, 2], stopped: false }])
  expect(run.logs.logs.filter(log => log.downloaded).map(log => log.id)).toEqual([1, 2, 3])
})

it('keeps what was fetched when cancelled, and goes on from there the next time', () => {
  const run = logsOf(false)
  run.logs.download([1], run.ok, run.fail)
  vi.advanceTimersByTime(10)
  run.logs.cancel(run.ok)

  expect(run.replies).toEqual([{ ids: [], stopped: true }, null])
  const half = (MOCK_LOGS[0]?.size ?? 0) / 2
  expect(run.logs.fetched.get(1)).toBe(half)
  run.events.length = 0
  run.logs.download([1], run.ok, run.fail)
  vi.advanceTimersByTime(20)

  expect(run.events.at(-1)).toMatchObject({ id: 1, state: 'done', resumedFrom: half })
})

it('erases nothing while a log has no checked copy: an erase takes every log, or none', () => {
  const run = logsOf(false)
  run.logs.erase(run.ok, run.fail)

  expect(run.errors).toEqual(['NOT_DOWNLOADED'])
  expect(run.replies).toEqual([])
  expect(run.logs.logs.map(log => log.id)).toEqual([1, 2, 3, 4])
})

it('erases every log when each has a checked copy', () => {
  const run = logsOf(false)
  run.logs.logs.forEach(log => {
    log.downloaded = true
  })
  run.logs.erase(run.ok, run.fail)

  expect(run.replies).toEqual([{ erased: [1, 2, 3, 4], kept: 0 }])
  expect(run.logs.logs).toEqual([])
})

it('forgets what it listed and fetched when the vehicle is gone', () => {
  const run = logsOf(false)
  run.logs.download([1], run.ok, run.fail)
  vi.advanceTimersByTime(10)
  run.logs.reset()

  expect(run.logs.run).toBeUndefined()
  expect(run.logs.fetched.size).toBe(0)
  expect(run.logs.logs.map(log => log.id)).toEqual([1, 2, 3, 4])
})
