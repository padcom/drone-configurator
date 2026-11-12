import { expect, it, vi } from 'vitest'
import { mockBackend } from '@/mock/mock-backend'
import { createConfigurator } from './useConfigurator'

const VERIFIED = 'uid-mock/00000003-1a2b3c4d.BIN'
const NOT_VERIFIED = 'uid-mock/00000002-1a2b3c4d.BIN'
const NO_TIMES = 'uid-mock/00000004-1a2b3c4d.BIN'

/**
 * A configurator over the mock, with the list read.
 *
 * @param localLogsStepMs how long a step of reading a log takes
 * @returns the Flights model
 */
async function flights(localLogsStepMs = 5) {
  const { flights: model } = createConfigurator(mockBackend({ telemetryMs: 600_000, localLogsStepMs }))
  await model.refresh()

  return model
}

/**
 * The points of a series of the open log.
 *
 * @param model the model
 * @param key the series
 * @returns the points, none for a series that is not there
 */
function pointsOf(model: Awaited<ReturnType<typeof flights>>, key: string) {
  return model.series.value[key]?.points ?? []
}

it('lists the logs on this computer, newest first, with nothing said of those that were not read', async () => {
  const model = await flights()

  expect(model.listed.value).toBe(true)
  expect(model.logs.value.map(log => log.id)).toEqual([3, 2, 1, 4])
  expect(model.logs.value.every(log => log.summary === undefined)).toBe(true)
  expect(model.phase.value).toBe('idle')
})

it('opens a verified log: reads it, then has its modes, its review and its series', async () => {
  const model = await flights()
  await model.select(VERIFIED)

  expect(model.phase.value).toBe('ready')
  expect(model.summary.value).toMatchObject({ verified: true, firmware: 'ArduCopter V4.7.2 (fb773567)' })
  expect(model.modes.value.map(m => m.mode)).toEqual([0, 4, 5, 9])
  expect(model.review.value).toHaveLength(11)
  expect(model.reviewMissing.value).toBeNull()
  expect(Object.keys(model.series.value).sort()).toEqual([
    'ATT.Pitch', 'ATT.Roll', 'BAT.Volt', 'CTUN.Alt', 'VIBE.VibeX', 'VIBE.VibeY', 'VIBE.VibeZ',
  ])
  expect(model.series.value['ATT.Roll']).toMatchObject({ found: true })
})

it('learns from the read what the list shows of the log', async () => {
  const model = await flights()
  await model.select(VERIFIED)

  const listed = () => model.logs.value.find(log => log.key === VERIFIED)
  await vi.waitFor(() => expect(listed()).toMatchObject({ summary: { verified: true } }))
})

it('keeps the gap in a series where the log has no samples, and the peak of one sample', async () => {
  const model = await flights()
  await model.select(VERIFIED)

  const gaps = pointsOf(model, 'CTUN.Alt').filter(p => p.y === null)
  expect(gaps).toHaveLength(1)
  // The gap is where the mock flight has no altitude: from 70 s to 75 s.
  expect(gaps[0]?.x).toBeGreaterThan(70)
  expect(gaps[0]?.x).toBeLessThan(76)
  expect(Math.max(...pointsOf(model, 'VIBE.VibeX').map(p => p.max ?? 0))).toBe(41)
})

it('opens a log that is not verified without a review, modes or series, and says why', async () => {
  const model = await flights()
  await model.select(NOT_VERIFIED)

  expect(model.phase.value).toBe('ready')
  expect(model.summary.value?.verified).toBe(false)
  expect(model.review.value).toBeNull()
  expect(model.reviewMissing.value).toBe('not-verified')
  // Nothing is concluded from bytes that are not known to be the vehicle's: nothing of it is asked for or drawn.
  expect(model.modes.value).toEqual([])
  expect(model.series.value).toEqual({})
})

it('opens a log with no times without asking for series', async () => {
  const model = await flights()
  await model.select(NO_TIMES)

  expect(model.phase.value).toBe('ready')
  expect(model.summary.value?.firstUs).toBeUndefined()
  expect(model.series.value).toEqual({})
  expect(model.modes.value).toEqual([])
})

it('tells how far the read is while it reads', async () => {
  const model = await flights(100)
  const opening = model.select(VERIFIED)

  await vi.waitFor(() => expect(model.progress.value).not.toBeNull())
  expect(model.phase.value).toBe('reading')
  expect(model.progress.value?.total).toBeGreaterThan(6_000_000)
  await opening
  expect(model.phase.value).toBe('ready')
})

it('stops on cancel without calling it an error, and closes the log', async () => {
  const model = await flights(100)
  const opening = model.select(VERIFIED)
  await vi.waitFor(() => expect(model.progress.value).not.toBeNull())
  await model.cancel()
  await opening

  expect(model.phase.value).toBe('idle')
  expect(model.open.value).toBeNull()
  expect(model.error.value).toBeNull()
})

it('does not open another log while one is read or its charts are asked for, and says it was stopped', async () => {
  const model = await flights(60)
  const opening = model.select(VERIFIED)
  await vi.waitFor(() => expect(model.phase.value).toBe('reading'), { interval: 5 })
  // In the reading phase, and later in the loading phase (the backend would answer BUSY): the second is ignored.
  await model.select(NOT_VERIFIED)
  expect(model.open.value).toBe(VERIFIED)
  await vi.waitFor(() => expect(model.phase.value).toBe('loading'), { interval: 5 })
  await model.select(NOT_VERIFIED)
  expect(model.open.value).toBe(VERIFIED)
  expect(model.error.value).toBeNull()
  await opening
  expect(model.phase.value).toBe('ready')
  expect(model.stopped.value).toBe(false)

  // Stopped: no error, and the model says so (the page announces it).
  const again = model.select(NOT_VERIFIED)
  await vi.waitFor(() => expect(model.phase.value).toBe('reading'), { interval: 5 })
  await model.cancel()
  await again
  expect(model.stopped.value).toBe(true)
  expect(model.error.value).toBeNull()
})

it('drops what comes for a log that is not the open one any more', async () => {
  const model = await flights(100)
  const first = model.select(VERIFIED)
  await vi.waitFor(() => expect(model.progress.value).not.toBeNull())
  // Another log is opened while the first is read (the backend reads one at a time: the first read is stopped).
  await model.cancel()
  await first
  await model.select(NOT_VERIFIED)

  expect(model.open.value).toBe(NOT_VERIFIED)
  expect(model.summary.value?.verified).toBe(false)
  expect(model.error.value).toBeNull()
})

it('shows the error when the backend cannot say', async () => {
  const { flights: model } = createConfigurator(mockBackend({ telemetryMs: 600_000, withoutLogs: true }))
  await model.refresh()

  expect(model.error.value).toContain('UNKNOWN_METHOD')
  await model.select(VERIFIED)
  expect(model.phase.value).toBe('failed')
  model.close()
  expect(model.phase.value).toBe('idle')
})
