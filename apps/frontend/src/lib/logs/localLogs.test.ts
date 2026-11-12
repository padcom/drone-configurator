import { expect, it } from 'vitest'
import type { LocalLogSummary, LogsLocalSeries, ReviewFinding, SeriesResult } from '@/generated/app'
import { clockOf, lengthOf, modeName, modeSpans, pointsOf, toneOf, worstOf } from './localLogs'

const SUMMARY: LocalLogSummary = {
  verified: true,
  messages: 100,
  problems: 0,
  firstUs: 1_000_000,
  lastUs: 61_000_000,
  firmware: 'ArduCopter V4.7.2 (fb773567)',
  modeChanges: 3,
}

it('names a mode only for a firmware whose modes are known', () => {
  expect(modeName('ArduCopter V4.7.2', 4)).toBe('Guided')
  expect(modeName('ArduCopter V4.7.2', 9)).toBe('Land')
  // A number the firmware does not have, another firmware, no firmware: the number is all there is.
  expect(modeName('ArduCopter V4.7.2', 8)).toBeNull()
  expect(modeName('ArduPlane V4.5', 4)).toBeNull()
  expect(modeName(undefined, 4)).toBeNull()
})

it('says how long a log is, and nothing for one with no times', () => {
  expect(lengthOf(SUMMARY)).toBe(60)
  expect(lengthOf({ ...SUMMARY, firstUs: undefined, lastUs: undefined })).toBeNull()
})

it('makes spans of the changes of mode: each lasts to the next change, the last to the end', () => {
  const modes = [
    { timeUs: 1_000_000, mode: 0 },
    { timeUs: 11_000_000, mode: 4 },
    { timeUs: 41_000_000, mode: 9 },
  ]
  expect(modeSpans(modes, SUMMARY)).toEqual([
    { fromS: 0, toS: 10, mode: 0 },
    { fromS: 10, toS: 40, mode: 4 },
    { fromS: 40, toS: 60, mode: 9 },
  ])
  // Nothing for a log without times or without changes; a change outside the log is cut to it.
  expect(modeSpans([], SUMMARY)).toEqual([])
  expect(modeSpans(modes, { ...SUMMARY, firstUs: undefined })).toEqual([])
  expect(modeSpans([{ timeUs: 999_000_000, mode: 1 }], SUMMARY)).toEqual([])
})

it('writes a time as minutes and seconds', () => {
  expect(clockOf(0)).toBe('0:00')
  expect(clockOf(47.9)).toBe('0:47')
  expect(clockOf(125)).toBe('2:05')
  expect(clockOf(-3)).toBe('0:00')
})

const ANSWER: LogsLocalSeries = { fromUs: 1_000_000, toUs: 10_999_999, buckets: 10, series: [] }

it('makes chart points of the parts that have samples, at the middle of the part, with a gap where parts are missing', () => {
  const result: SeriesResult = {
    message: 'ATT',
    field: 'Roll',
    found: true,
    invalid: 0,
    points: [
      { index: 0, min: 1, max: 3, count: 5 },
      { index: 1, min: 2, max: 2, count: 1 },
      // Parts 2 to 4 have no samples.
      { index: 5, min: -4, max: 6, count: 9 },
    ],
  }
  const points = pointsOf(result, ANSWER, 1_000_000)
  expect(points.map(p => [p.x, p.y])).toEqual([[0.5, 2], [1.5, 2], [2.5, null], [5.5, 1]])
  // The envelope is the smallest and largest value; the spike is not lost.
  expect(points[3]).toMatchObject({ min: -4, max: 6 })
  // No gap marker at the ends.
  expect(pointsOf({ ...result, points: [result.points[2] as never] }, ANSWER, 1_000_000)).toHaveLength(1)
  expect(pointsOf({ ...result, points: [] }, ANSWER, 1_000_000)).toEqual([])
})

it('gives each finding a tone, and finds the worst thing the review said', () => {
  const finding = (level: ReviewFinding['level']): ReviewFinding => ({ id: 'x', level })
  expect(['ok', 'warn', 'bad', 'info', 'no-data'].map(level => toneOf(finding(level as ReviewFinding['level'])))).toEqual([
    'ok', 'warn', 'error', 'muted', 'muted',
  ])
  expect(worstOf([finding('ok'), finding('warn'), finding('ok')])).toBe('warn')
  expect(worstOf([finding('warn'), finding('bad'), finding('ok')])).toBe('bad')
  expect(worstOf([finding('ok'), finding('no-data'), finding('info')])).toBe('ok')
  expect(worstOf([finding('info'), finding('no-data')])).toBeNull()
  expect(worstOf([])).toBeNull()
})
