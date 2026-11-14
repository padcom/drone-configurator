// The analysis of a flight log: a log is read, its RATE messages are looked at in two passes (where the desired rate jumps,
// then a window at each place), and the steps are measured. The backend is a fake that answers `logs.local.series` from a
// flight of which the steps are known: 0 to 57 deg/s at 20 s, down to 10 at 45 s, down to -30 at 70 s, logged at 25 Hz, the
// actual rate a first-order lag of 100 ms behind the desired one.
import { describe, expect, it } from 'vitest'
import type { BackendClient } from '@/backend/client'
import type { LogsLocalSeries, LogsLocalSeriesAsk, SeriesPoint } from '@/generated/app'
import type { LogStep } from '@/lib/tune/flightSteps'
import { useAnalysis } from './useAnalysis'

/** The steps of the flight: when (s) and where the desired roll rate goes. */
const STEPS: [number, number][] = [[20, 57], [45, 10], [70, -30]]
const LOG_S = 100
const SAMPLE_US = 40_000

/**
 * The level the desired rate goes to at a step (before the first: 0).
 *
 * @param index which step
 * @returns the level
 */
function levelOf(index: number): number {
  return STEPS[index]?.[1] ?? 0
}

/**
 * The desired rate at a time.
 *
 * @param s seconds
 * @returns the rate
 */
function desiredAt(s: number): number {
  return levelOf(STEPS.findLastIndex(([at]) => at <= s))
}

/**
 * The actual rate at a time: a lag of 100 ms behind the last step.
 *
 * @param s seconds
 * @returns the rate
 */
function actualAt(s: number): number {
  const index = STEPS.findLastIndex(([at]) => at <= s)
  const from = levelOf(index - 1)

  return index < 0 ? 0 : from + (levelOf(index) - from) * (1 - Math.exp(-(s - (STEPS[index]?.[0] ?? 0)) / 0.1))
}

/**
 * Adds a sample to the parts of the time.
 *
 * @param parts the parts so far, by index
 * @param index the part of the sample
 * @param value its value
 */
function addSample(parts: Map<number, SeriesPoint>, index: number, value: number): void {
  const was = parts.get(index) ?? { index, min: value, max: value, count: 0 }
  parts.set(index, { index, min: Math.min(was.min, value), max: Math.max(was.max, value), count: was.count + 1 })
}

/** The part of the time that was asked for. */
interface Span {
  fromUs: number
  toUs: number
  buckets: number
}

/**
 * The parts of the time of a field of the log: its samples (25 Hz) gathered.
 *
 * @param field the field
 * @param span the part of the time asked for
 * @returns the parts that hold a sample
 */
function partsOf(field: string, span: Span): SeriesPoint[] {
  const parts = new Map<number, SeriesPoint>()
  const part = (span.toUs - span.fromUs + 1) / span.buckets

  for (let us = Math.ceil(span.fromUs / SAMPLE_US) * SAMPLE_US; us <= span.toUs; us += SAMPLE_US) {
    addSample(parts, Math.floor((us - span.fromUs) / part), field.endsWith('Des') ? desiredAt(us / 1e6) : actualAt(us / 1e6))
  }

  return [...parts.values()]
}

/**
 * The answer to a series ask: the log's samples gathered into the parts of the time that were asked.
 *
 * @param ask what was asked
 * @param only the fields the log has (the others are not found)
 * @param flat whether the signal is flat (no step)
 * @returns the answer
 */
function answerOf(ask: LogsLocalSeriesAsk, only: readonly string[], flat: boolean): LogsLocalSeries {
  const span = { fromUs: Number(ask.fromUs ?? 0), toUs: Number(ask.toUs ?? LOG_S * 1e6), buckets: ask.buckets }

  return {
    fromUs: span.fromUs,
    toUs: span.toUs,
    buckets: ask.buckets,
    series: ask.series.map(one => {
      const found = only.includes(one.field)
      const points = found ? partsOf(one.field, span) : []

      const shown = flat ? points.map(p => ({ ...p, min: 3, max: 3 })) : points

      return { message: one.message, field: one.field, found, points: shown, invalid: 0 }
    }),
  }
}

/** What a log has, for a fake backend. */
interface Log {
  kinds?: { name: string, count: number }[]
  fields?: string[]
  steps?: boolean
  /** Is told of each series that is asked for (its number, from 1), as the backend gets it. */
  onSeries?: (number: number) => void
}

/** What a test has: the model and what the fake backend was asked. */
interface Rig {
  analysis: ReturnType<typeof useAnalysis>
  asked: { name: string, payload: unknown }[]
}

/**
 * A model over a fake backend.
 *
 * @param log what the log has: the kinds of message, the fields of RATE, whether the signal has steps (else it is flat)
 * @returns the model and the asks
 */
function rig(log: Log = {}): Rig {
  const asked: Rig['asked'] = []
  const kinds = log.kinds ?? [{ name: 'RATE', count: LOG_S * 25 + 1 }]
  const fields = log.fields ?? ['RDes', 'R', 'PDes', 'P', 'YDes', 'Y']
  let series = 0
  const answers: Record<string, (payload: unknown) => unknown> = {
    'logs.local.read': () => ({ firstUs: 0, lastUs: LOG_S * 1e6, firmware: 'ArduCopter V4.7.2' }),
    'logs.local.messages': () => ({ types: kinds.map(kind => ({ ...kind, fields: [] })) }),
    'logs.local.series': payload => {
      series += 1
      log.onSeries?.(series)

      return answerOf(payload as LogsLocalSeriesAsk, fields, log.steps === false)
    },
  }
  const client = {
    onEvent: () => () => undefined,
    call: (name: string, payload: unknown) => {
      asked.push({ name, payload })

      return Promise.resolve(answers[name]?.(payload) ?? null)
    },
  } as unknown as BackendClient

  return { analysis: useAnalysis({ client }), asked }
}

/**
 * The first of the steps that were measured.
 *
 * @param analysis the model
 * @returns the step
 * @throws {Error} when there is none
 */
function firstStep(analysis: Rig['analysis']): LogStep {
  const [first] = analysis.steps.value
  if (first === undefined) {
    throw new Error('no step')
  }

  return first
}

describe('a log with steps', () => {
  it('is read, and the steps are listed, the largest first, and the largest is shown', async () => {
    const { analysis } = rig()
    await analysis.choose('car/1.BIN')

    expect(analysis.phase.value).toBe('ready')
    expect(analysis.steps.value.map(step => Math.round(step.size))).toEqual([57, -47, -40])
    expect(analysis.chosen.value).toBe(0)
  })

  it('looks at the whole log in a coarse pass and then at a window at each place', async () => {
    const { analysis, asked } = rig()
    await analysis.choose('car/1.BIN')
    const passes = asked.filter(call => call.name === 'logs.local.series').map(call => call.payload as LogsLocalSeriesAsk)
    expect(passes).toHaveLength(4)
    expect(passes[0]?.fromUs).toBeUndefined()
    expect(passes[0]?.series).toEqual([{ message: 'RATE', field: 'RDes' }])
    expect(passes[1]?.series.map(one => one.field)).toEqual(['RDes', 'R'])
  })
})

describe('what is measured of the steps of a log', () => {
  it('measures each step of the lag: a rise of 2.2 time constants, and no overshoot', async () => {
    const { analysis } = rig()
    await analysis.choose('car/1.BIN')
    const first = firstStep(analysis)

    expect(first.atUs).toBeGreaterThan(19_900_000)
    expect(first.atUs).toBeLessThan(20_200_000)
    expect(first.metrics.riseMs).toBeGreaterThan(190)
    expect(first.metrics.riseMs).toBeLessThan(260)
    expect(first.metrics.overshootPct).toBeCloseTo(0, 0)
  })

  it('says how often RATE was logged', async () => {
    const { analysis } = rig()
    await analysis.choose('car/1.BIN')

    expect(analysis.rateHz.value).toBeCloseTo(25, 5)
  })
})

describe('the steps and the axes of an open log', () => {
  it('shows another of the steps when asked, and not one that is not there', async () => {
    const { analysis } = rig()
    await analysis.choose('car/1.BIN')
    analysis.select(2)
    expect(analysis.chosen.value).toBe(2)
    analysis.select(7)
    analysis.select(-1)

    expect(analysis.chosen.value).toBe(2)
  })

  it('looks at another axis of the open log without reading it again, asking for that axis\'s fields', async () => {
    const { analysis, asked } = rig()
    await analysis.choose('car/1.BIN')
    const reads = asked.filter(call => call.name === 'logs.local.read').length

    await analysis.pick('pitch')

    expect(asked.filter(call => call.name === 'logs.local.read')).toHaveLength(reads)
    const last = asked.filter(call => call.name === 'logs.local.series').at(-1)
    expect((last?.payload as LogsLocalSeriesAsk).series.map(one => one.field)).toEqual(['PDes', 'P'])
    expect(analysis.axis.value).toBe('pitch')
  })
})

describe('a log with nothing to show', () => {
  it('says it has no RATE messages, and asks for no series', async () => {
    const { analysis, asked } = rig({ kinds: [{ name: 'ATT', count: 100 }] })
    await analysis.choose('car/1.BIN')

    expect([analysis.phase.value, analysis.reason.value]).toEqual(['none', 'noRate'])
    expect(asked.filter(call => call.name === 'logs.local.series')).toHaveLength(0)
  })

  it('says there is no step when the desired rate does not jump by a step', async () => {
    const { analysis } = rig({ steps: false })
    await analysis.choose('car/1.BIN')

    expect([analysis.phase.value, analysis.reason.value]).toEqual(['none', 'noStep'])
    expect(analysis.steps.value).toEqual([])
  })
})

describe('stopping a pass', () => {
  it('ends the pass before its next request when Stop lands between two requests, which leaves nothing to cancel', async () => {
    let stop: () => Promise<void> = () => Promise.resolve()
    const { analysis, asked } = rig({ onSeries: number => { if (number === 2) void stop() } })
    stop = () => analysis.cancel()
    await analysis.choose('car/1.BIN')

    // the coarse pass and the first window were asked; the other windows were not
    expect(asked.filter(call => call.name === 'logs.local.series')).toHaveLength(2)
    expect(analysis.stopped.value).toBe(true)
    expect(analysis.phase.value).toBe('idle')
    expect(analysis.steps.value).toEqual([])
    expect(analysis.error.value).toBeNull()
  })

  it('does nothing when no pass is under way', async () => {
    const { analysis, asked } = rig()
    await analysis.choose('car/1.BIN')
    await analysis.cancel()

    expect(analysis.phase.value).toBe('ready')
    expect(asked.filter(call => call.name === 'logs.local.cancel')).toHaveLength(0)
  })
})

describe('a log that cannot be read, or is closed', () => {
  it('says the call failed, and what it said', async () => {
    const failing = { onEvent: () => () => undefined, call: () => Promise.reject(new Error('no such log')) }
    const analysis = useAnalysis({ client: failing as unknown as BackendClient })
    await analysis.choose('car/9.BIN')

    expect(analysis.phase.value).toBe('failed')
    expect(analysis.error.value).toContain('no such log')
  })

  it('is closed: nothing of the log is kept, the axis chosen is', async () => {
    const { analysis } = rig()
    await analysis.pick('yaw')
    await analysis.choose('car/1.BIN')
    analysis.close()

    expect(analysis.phase.value).toBe('idle')
    expect(analysis.steps.value).toEqual([])
    expect(analysis.open.value).toBeNull()
  })
})
