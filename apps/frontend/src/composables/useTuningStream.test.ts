// The live response of the Tune screen: the stream begins and ends with the screen, keeps the last seconds and no more, counts
// what
// the backend dropped, says when what it shows is old, and says why a stream did not begin. The mock sends only what a test
// pushes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackendClient } from '@/backend/client'
import type { TuningBatch } from '@/generated/app'
import { type MockControl, mockBackend } from '@/mock/mock-backend'
import { KEEP_MS, KEEP_POINTS, STALE_MS, appended, useTuningStream } from './useTuningStream'

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A batch.
 *
 * @param actual the times and values of the actual line
 * @param desired the times and values of the desired line
 * @param dropped how many points the backend has dropped
 * @returns the batch
 */
function batchOf(actual: [number, number][], desired: [number, number][] = [], dropped = 0): TuningBatch {
  return {
    actual: actual.map(([t, v]) => ({ t, v })),
    desired: desired.map(([t, v]) => ({ t, v })),
    dropped,
    asked: { actual: true, desired: true },
  }
}

/**
 * A stream over the mock, with a vehicle connected and a clock the test moves.
 *
 * @param connected whether a vehicle is connected
 * @returns the stream, the mock's controls and the clock
 */
async function rig(connected = true) {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control, telemetryMs: 600_000 }))
  if (connected) {
    await client.call('vehicle.connect', { transport: 'simulator' })
  }
  const clock = { now: 1_000_000 }
  const stream = useTuningStream({ client, now: () => clock.now })

  return { stream, control, clock }
}

describe('the stream of the Tune screen', () => {
  it('begins when it is asked for, at 25 Hz, and keeps what the backend sends, nothing else', async () => {
    const { stream, control } = await rig()
    expect(stream.state.value).toBe('idle')
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))
    expect(control.tuning?.rateHz()).toBe(25)
    expect(stream.state.value).toBe('starting')
    expect([stream.actual.value, stream.desired.value]).toEqual([[], []])

    control.tuning?.push(batchOf([[100, 1.5], [140, 2.5]], [[100, 0]]))
    await vi.waitFor(() => expect(stream.state.value).toBe('live'))

    expect(stream.actual.value).toEqual([{ t: 100, v: 1.5 }, { t: 140, v: 2.5 }])
    expect(stream.desired.value).toEqual([{ t: 100, v: 0 }])
    expect(stream.asked.value).toEqual({ actual: true, desired: true })
    stream.stop()
  })
})

describe('the stream of the Tune screen, stopped', () => {
  it('ends when it is stopped, which the backend sees; the points stay, marked old', async () => {
    const { stream, control } = await rig()
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))
    control.tuning?.push(batchOf([[100, 1]]))
    await vi.waitFor(() => expect(stream.actual.value).toHaveLength(1))

    stream.stop()

    await vi.waitFor(() => expect(control.tuning?.running()).toBe(false))
    expect(stream.state.value).toBe('idle')
    expect(stream.actual.value).toHaveLength(1)
    expect(stream.stale.value).toBe(true)
  })
})

describe('the stream of the Tune screen, asked for again', () => {
  it('is asked for once, however often it is started, and again after it was stopped', async () => {
    const { stream, control } = await rig()
    stream.start()
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.began()).toBe(1))
    stream.stop()
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.began()).toBe(2))
    stream.stop()
  })
})

describe('the stream of the Tune screen, counting what is dropped', () => {
  it('counts what the backend dropped, from the batch, and begins again from nothing with a new stream', async () => {
    const { stream, control } = await rig()
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))
    control.tuning?.push(batchOf([[100, 1]], [], 7))
    await vi.waitFor(() => expect(stream.dropped.value).toBe(7))
    stream.stop()
    stream.start()
    expect(stream.dropped.value).toBe(0)
    stream.stop()
  })
})

describe('what is shown is old', () => {
  it('is old until something has come, new for a moment after a batch, and old again when nothing comes', async () => {
    const { stream, control, clock } = await rig()
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))
    expect(stream.stale.value).toBe(true)

    control.tuning?.push(batchOf([[100, 1]]))
    await vi.waitFor(() => expect(stream.stale.value).toBe(false))

    clock.now += STALE_MS + 600
    // (the clock is looked at by a timer)
    await vi.waitFor(() => expect(stream.stale.value).toBe(true), { timeout: 2000 })
    stream.stop()
  })
})

describe('what the stream says when it does not run', () => {
  it('says why there is no vehicle, and is not running', async () => {
    const { stream, control } = await rig(false)
    stream.start()

    await vi.waitFor(() => expect(stream.state.value).toBe('ended'))
    expect(stream.problem.value).toContain('NOT_CONNECTED')
    expect(control.tuning?.running()).toBe(false)
    expect(stream.stale.value).toBe(true)
  })

  it('says that the backend ended it, and begins again when asked', async () => {
    const { stream, control } = await rig()
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))

    control.tuning?.end('LINK_LOST')

    await vi.waitFor(() => expect(stream.state.value).toBe('ended'))
    expect(stream.problem.value).toContain('LINK_LOST')
    stream.start()
    await vi.waitFor(() => expect(control.tuning?.running()).toBe(true))
    expect(stream.state.value).toBe('starting')
    stream.stop()
  })
})

describe('the points that are kept', () => {
  it('are the last seconds only, and at most so many', () => {
    const old = [{ t: 0, v: 1 }, { t: 1000, v: 2 }]
    const kept = appended(old, [{ t: KEEP_MS + 500, v: 3 }])

    expect(kept).toEqual([{ t: 1000, v: 2 }, { t: KEEP_MS + 500, v: 3 }])
    const many = Array.from({ length: KEEP_POINTS + 50 }, (_, i) => ({ t: i, v: i }))
    expect(appended([], many)).toHaveLength(KEEP_POINTS)
    expect(appended([], many).at(-1)?.t).toBe(KEEP_POINTS + 49)
  })

  it('are only points of a real rate: NaN and infinities are not kept', () => {
    const kept = appended([{ t: 10, v: 1 }], [{ t: 20, v: Number.NaN }, { t: 30, v: Number.NEGATIVE_INFINITY }, { t: 40, v: 2 }])

    expect(kept).toEqual([{ t: 10, v: 1 }, { t: 40, v: 2 }])
  })

  it('begin again when the vehicle\'s clock goes back (it restarted)', () => {
    const kept = appended([{ t: 50_000, v: 1 }, { t: 50_040, v: 2 }], [{ t: 100, v: 3 }])

    expect(kept).toEqual([{ t: 100, v: 3 }])
  })
})
