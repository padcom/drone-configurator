// "Analyse the last flight": a log on this computer is read, and the step response of an axis is measured from its RATE
// messages (the desired rate and the actual one the vehicle logged), by the same module that measures the live stream
// (lib/tune/stepResponse.ts). The backend gives a signal in parts of the time (`logs.local.series`), so there are two passes: a
// coarse one over the whole log finds where the desired rate jumps, and each of the largest places is then asked again as a
// window of a few seconds, fine enough to hold a sample or less in a part. Nothing is made up: a log with no RATE says so, a log
// with no step that holds says so, and what a window shows is what the log holds. One pass at a time, with progress and a way
// to stop.
import { type Ref, type ShallowRef, ref, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import type { LocalLogSummary, LogsLocalSeries, SeriesResult } from '@/generated/app'
import {
  type Candidate, type Cut, type LogStep, candidatesOf, loggedRate, ratePointsOf, rankedSteps, stepOfWindow,
} from '@/lib/tune/flightSteps'
import { asNumber } from '@/lib/logs/localLogs'

/** What the model needs. */
export interface AnalysisDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** The axes of the RATE message: the field of the desired rate and of the actual one. */
export const AXES = {
  roll: { desired: 'RDes', actual: 'R' },
  pitch: { desired: 'PDes', actual: 'P' },
  yaw: { desired: 'YDes', actual: 'Y' },
} as const

/** An axis. */
export type Axis = keyof typeof AXES

/** How far it has got. */
export type AnalysisPhase = 'idle' | 'reading' | 'finding' | 'measuring' | 'ready' | 'none' | 'failed'

/** Why a log has nothing to show: it has no RATE messages, or no step that holds. */
export type NoneReason = 'noRate' | 'noStep'

/** The buckets of a coarse pass and of a window. */
const BUCKETS = 2000

/** The Analysis model. */
export interface AnalysisModel {
  /** The key of the log that is open, or null. */
  readonly open: Readonly<Ref<string | null>>
  /** How far it has got. */
  readonly phase: Readonly<Ref<AnalysisPhase>>
  /** The axis that is looked at. */
  readonly axis: Readonly<Ref<Axis>>
  /** What the read found of the log (its firmware, its times). */
  readonly summary: ShallowRef<LocalLogSummary | null>
  /** How often RATE was logged (messages a second), or null when it is not known. */
  readonly rateHz: Readonly<Ref<number | null>>
  /** The steps that were measured, the largest first. */
  readonly steps: ShallowRef<LogStep[]>
  /** The step that is shown (an index of `steps`). */
  readonly chosen: Readonly<Ref<number>>
  /** Why there is nothing to show, when the phase is `none`. */
  readonly reason: Readonly<Ref<NoneReason | null>>
  /** How far the read of the log is, or null when it is not reading. */
  readonly progress: ShallowRef<{ bytes: number, total: number } | null>
  /** How many places have been measured, of how many (while measuring). */
  readonly measured: Readonly<Ref<{ done: number, of: number } | null>>
  /** Whether the last pass was stopped by the user. */
  readonly stopped: Readonly<Ref<boolean>>
  /** What the last call that failed said. */
  readonly error: ShallowRef<string | null>
  /** Opens a log: reads it, and finds and measures the steps of the axis. */
  choose: (key: string) => Promise<void>
  /** Looks at another axis of the open log. */
  pick: (axis: Axis) => Promise<void>
  /** Shows another of the steps. */
  select: (index: number) => void
  /** Stops the pass that is under way. */
  cancel: () => Promise<void>
  /** Closes the log. */
  close: () => void
}

/**
 * The result of a series in an answer.
 *
 * @param answer what the backend said
 * @param field the field
 * @returns its result, if the answer has it
 */
function resultFor(answer: LogsLocalSeries, field: string): SeriesResult | undefined {
  return answer.series.find(result => result.message === 'RATE' && result.field === field)
}

/**
 * The cut an answer was made in.
 *
 * @param answer what the backend said
 * @returns the cut
 */
function cutOf(answer: LogsLocalSeries): Cut {
  return { fromUs: asNumber(answer.fromUs), toUs: asNumber(answer.toUs), buckets: answer.buckets }
}

/**
 * How often RATE was logged.
 *
 * @param count how many RATE messages the log holds
 * @param summary what the read found of the log
 * @returns messages a second, or null when the log has no times
 */
function rateOf(count: number, summary: LocalLogSummary | null): number | null {
  const { firstUs, lastUs } = summary ?? {}

  return firstUs === undefined ? null : loggedRate(count, asNumber(firstUs), asNumber(lastUs ?? firstUs))
}

/**
 * The places of an answer where the desired rate jumps.
 *
 * @param answer the coarse pass
 * @param desired the field of the desired rate
 * @returns the places, the biggest jumps first
 */
function placesOf(answer: LogsLocalSeries, desired: string): Candidate[] {
  return candidatesOf(resultFor(answer, desired)?.points ?? [], cutOf(answer))
}

/**
 * The step of a window of the log.
 *
 * @param answer the fine pass
 * @param fields the field of the desired rate and of the actual one
 * @param fields.desired the desired rate
 * @param fields.actual the actual rate
 * @returns the step, or null when there is none that holds
 */
function stepOf(answer: LogsLocalSeries, fields: { desired: string, actual: string }): LogStep | null {
  const cut = cutOf(answer)

  return stepOfWindow(ratePointsOf(resultFor(answer, fields.desired), cut), ratePointsOf(resultFor(answer, fields.actual), cut))
}

/** The Analysis model. */
class Analysis implements AnalysisModel {
  readonly open = ref<string | null>(null)
  readonly phase = ref<AnalysisPhase>('idle')
  readonly axis = ref<Axis>('roll')
  readonly summary = shallowRef<LocalLogSummary | null>(null)
  readonly rateHz = ref<number | null>(null)
  readonly steps = shallowRef<LogStep[]>([])
  readonly chosen = ref(0)
  readonly reason = ref<NoneReason | null>(null)
  readonly progress = shallowRef<{ bytes: number, total: number } | null>(null)
  readonly measured = ref<{ done: number, of: number } | null>(null)
  readonly stopped = ref(false)
  readonly error = shallowRef<string | null>(null)

  /**
   * Makes the model, and listens to the progress of passes.
   *
   * @param deps the client
   */
  constructor(private readonly deps: AnalysisDeps) {
    deps.client.onEvent('logs.local.progress', progress => {
      if (progress.key === this.open.value && ['reading', 'finding', 'measuring'].includes(this.phase.value)) {
        this.progress.value = { bytes: asNumber(progress.bytes), total: asNumber(progress.total) }
      }
    })
  }

  /**
   * Whether a pass is under way.
   *
   * @returns true while the log is read or looked at
   */
  private busy(): boolean {
    return ['reading', 'finding', 'measuring'].includes(this.phase.value)
  }

  async choose(key: string): Promise<void> {
    if (this.busy()) {
      return
    }
    this.close()
    this.open.value = key
    this.phase.value = 'reading'

    try {
      this.summary.value = await this.deps.client.call('logs.local.read', { key })

      if (await this.hasRate(key)) {
        await this.analyse(key)
      }
    } catch (error) {
      this.failed(key, error)
    }
  }

  /**
   * Whether the log has RATE messages, and how often they were logged (a log without them has nothing to measure).
   *
   * @param key the log
   * @returns true if it has them
   */
  private async hasRate(key: string): Promise<boolean> {
    const { types } = await this.deps.client.call('logs.local.messages', { key })
    const rate = types.find(type => type.name === 'RATE' && type.count > 0)
    if (rate === undefined || this.open.value !== key) {
      this.none('noRate')

      return false
    }
    this.rateHz.value = rateOf(rate.count, this.summary.value)

    return true
  }

  /**
   * The series of the axis over a part of the time.
   *
   * @param key the log
   * @param fields the fields of RATE
   * @param span the part of the time, or none for the whole log
   * @param span.fromUs where it begins
   * @param span.toUs where it ends
   * @returns what the backend said
   */
  private series(key: string, fields: string[], span?: { fromUs: number, toUs: number }): Promise<LogsLocalSeries> {
    return this.deps.client.call('logs.local.series', {
      key,
      series: fields.map(field => ({ message: 'RATE', field })),
      buckets: BUCKETS,
      ...span,
    })
  }

  /**
   * Finds the places of the axis where the desired rate jumps, and measures the step at each.
   *
   * @param key the log
   */
  private async analyse(key: string): Promise<void> {
    const fields = AXES[this.axis.value]
    this.phase.value = 'finding'
    const places = placesOf(await this.series(key, [fields.desired], undefined), fields.desired)
    this.phase.value = 'measuring'
    this.measured.value = { done: 0, of: places.length }
    const found: LogStep[] = []

    for (const [index, place] of places.entries()) {
      if (this.open.value !== key) {
        return
      }
      // (one pass over the file at a time: the backend answers one request, then the next)
      // eslint-disable-next-line no-await-in-loop
      const step = stepOf(await this.series(key, [fields.desired, fields.actual], place.window), fields)
      found.push(...step === null ? [] : [step])
      this.measured.value = { done: index + 1, of: places.length }
    }
    this.finish(key, rankedSteps(found))
  }

  /**
   * The passes are over: the steps, or why there are none.
   *
   * @param key the log
   * @param steps the steps that were measured
   */
  private finish(key: string, steps: LogStep[]): void {
    if (this.open.value !== key) {
      return
    }
    this.progress.value = null
    this.measured.value = null
    this.steps.value = steps
    this.chosen.value = 0

    if (steps.length === 0) {
      this.none('noStep')
    } else {
      this.phase.value = 'ready'
    }
  }

  /**
   * There is nothing to show of this log.
   *
   * @param reason why
   */
  private none(reason: NoneReason): void {
    this.reason.value = reason
    this.phase.value = 'none'
    this.progress.value = null
    this.measured.value = null
  }

  /**
   * The log that another axis of can be looked at: the one that is open and read, when nothing is under way.
   *
   * @param axis the axis asked for
   * @returns its key, or null when the axis cannot be changed now
   */
  private openFor(axis: Axis): string | null {
    return this.busy() || axis === this.axis.value || this.summary.value === null ? null : this.open.value
  }

  async pick(axis: Axis): Promise<void> {
    const key = this.openFor(axis)
    if (key === null) {
      return
    }
    this.axis.value = axis
    this.steps.value = []
    this.reason.value = null

    try {
      await this.analyse(key)
    } catch (error) {
      this.failed(key, error)
    }
  }

  select(index: number): void {
    if (index >= 0 && index < this.steps.value.length) {
      this.chosen.value = index
    }
  }

  /**
   * A call for the open log failed: stopping it by hand is not an error, anything else is shown.
   *
   * @param key the log it was for
   * @param error what it threw
   */
  private failed(key: string, error: unknown): void {
    if (this.open.value !== key) {
      return
    }
    this.progress.value = null
    this.measured.value = null

    if (toBackendError(error).code === 'ABORTED') {
      this.close()
      this.stopped.value = true

      return
    }
    this.phase.value = 'failed'
    this.error.value = describeError(error)
  }

  async cancel(): Promise<void> {
    try {
      await this.deps.client.call('logs.local.cancel', null)
    } catch (error) {
      this.error.value = describeError(error)
    }
  }

  close(): void {
    this.open.value = null
    this.phase.value = 'idle'
    this.summary.value = null
    this.rateHz.value = null
    this.steps.value = []
    this.chosen.value = 0
    this.reason.value = null
    this.progress.value = null
    this.measured.value = null
    this.stopped.value = false
    this.error.value = null
  }
}

/**
 * The Analysis model.
 *
 * @param deps the client
 * @returns the model
 */
export function useAnalysis(deps: AnalysisDeps): AnalysisModel {
  return new Analysis(deps)
}
