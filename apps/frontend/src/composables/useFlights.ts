// The flight logs on this computer, for the Flights view: the list, the log that is open, what reading it found (how long,
// which firmware, the changes of mode), the thinned series for the charts, and the automatic review. The backend (`logs.local.*`)
// does the work, a chunk of the file at a time; this keeps what the screen shows. A log is read first (with progress, and
// cancelable); then its modes, its review (only a verified log has one) and its series are asked for. Nothing is made up: a
// series the log lacks, a part of the time without samples, and a review that does not exist are said to be absent.
import { type Ref, type ShallowRef, ref, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import type { LocalLog, LocalLogSummary, LogsLocalSeries, ModeChange, ReviewFinding, SeriesAsk } from '@/generated/app'
import type { ChartPoint } from '@/lib/charts/chart'
import { asNumber, pointsOf } from '@/lib/logs/localLogs'

/** What the Flights model needs. */
export interface FlightsDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** The series the charts draw, asked for together: the message, the field, and the instance (IMU 0) where there are several. */
export const FLIGHT_SERIES: readonly SeriesAsk[] = [
  { message: 'ATT', field: 'Roll' },
  { message: 'ATT', field: 'Pitch' },
  { message: 'CTUN', field: 'Alt' },
  { message: 'VIBE', field: 'VibeX', whereField: 'IMU', whereValue: 0 },
  { message: 'VIBE', field: 'VibeY', whereField: 'IMU', whereValue: 0 },
  { message: 'VIBE', field: 'VibeZ', whereField: 'IMU', whereValue: 0 },
  { message: 'BAT', field: 'Volt', whereField: 'Inst', whereValue: 0 },
]

/** How many parts the time of a log is cut in for a chart. */
const PARTS = 400

/** What the screen has of one series. */
export interface DrawnSeries {
  /** Whether the log has this series at all. */
  found: boolean
  /** The unit the log names for it, if it does. */
  unit?: string
  /** The points of the chart line. */
  points: ChartPoint[]
}

/** How far the open log has got. */
export type Phase = 'idle' | 'reading' | 'loading' | 'ready' | 'failed'

/** The Flights model. */
export interface FlightsModel {
  /** The logs on this computer, newest first. */
  readonly logs: ShallowRef<LocalLog[]>
  /** Whether the list has been read. */
  readonly listed: Readonly<Ref<boolean>>
  /** Whether the list is being read. */
  readonly loading: Readonly<Ref<boolean>>
  /** The key of the log that is open, or null. */
  readonly open: Readonly<Ref<string | null>>
  /** How far the open log has got. */
  readonly phase: Readonly<Ref<Phase>>
  /** How far the read of the open log is, or null when it is not reading. */
  readonly progress: ShallowRef<{ bytes: number, total: number } | null>
  /** What the read found. */
  readonly summary: ShallowRef<LocalLogSummary | null>
  /** The changes of flight mode. */
  readonly modes: ShallowRef<ModeChange[]>
  /** The series of the charts, by `message.field`. */
  readonly series: ShallowRef<Record<string, DrawnSeries>>
  /** The review, or null when there is none (the log is not verified, or it is not loaded yet). */
  readonly review: ShallowRef<ReviewFinding[] | null>
  /** Why a review is missing, when the log is open and loaded without one: the log is not verified. */
  readonly reviewMissing: Readonly<Ref<'not-verified' | null>>
  /** Whether the last log that was being opened was stopped (by Stop): there is no log open then, and no error. */
  readonly stopped: Readonly<Ref<boolean>>
  /** What the last call that failed said. */
  readonly error: ShallowRef<string | null>
  /** Reads the list. */
  refresh: () => Promise<void>
  /** Opens a log: reads it and asks for what the charts and the review need. */
  select: (key: string) => Promise<void>
  /** Stops the read that is under way. */
  cancel: () => Promise<void>
  /** Closes the log that is open. */
  close: () => void
}

/**
 * The series of an answer as the screen draws them, by `message.field`.
 *
 * @param answer what the backend answered
 * @param firstUs the time of the log's first message
 * @returns the series
 */
function drawn(answer: LogsLocalSeries, firstUs: number): Record<string, DrawnSeries> {
  const out: Record<string, DrawnSeries> = {}

  for (const result of answer.series) {
    out[`${result.message}.${result.field}`] = {
      found: result.found,
      ...result.unit === undefined ? {} : { unit: result.unit },
      points: pointsOf(result, answer, firstUs),
    }
  }

  return out
}

/** The Flights model. */
class Flights implements FlightsModel {
  readonly logs = shallowRef<LocalLog[]>([])
  readonly listed = ref(false)
  readonly loading = ref(false)
  readonly open = ref<string | null>(null)
  readonly phase = ref<Phase>('idle')
  readonly progress = shallowRef<{ bytes: number, total: number } | null>(null)
  readonly summary = shallowRef<LocalLogSummary | null>(null)
  readonly modes = shallowRef<ModeChange[]>([])
  readonly series = shallowRef<Record<string, DrawnSeries>>({})
  readonly review = shallowRef<ReviewFinding[] | null>(null)
  readonly reviewMissing = ref<'not-verified' | null>(null)
  readonly stopped = ref(false)
  readonly error = shallowRef<string | null>(null)

  /**
   * Makes the model, and listens to the progress of reads.
   *
   * @param deps the client
   */
  constructor(private readonly deps: FlightsDeps) {
    deps.client.onEvent('logs.local.progress', progress => {
      if (progress.key === this.open.value && this.phase.value === 'reading') {
        this.progress.value = { bytes: asNumber(progress.bytes), total: asNumber(progress.total) }
      }
    })
  }

  async refresh(): Promise<void> {
    this.loading.value = true

    try {
      const answer = await this.deps.client.call('logs.local.list', null)
      this.logs.value = answer.logs
      this.listed.value = true
      this.error.value = null
    } catch (error) {
      this.error.value = describeError(error)
    } finally {
      this.loading.value = false
    }
  }

  /**
   * Whether a log is being read, or what is drawn of it is being asked for.
   *
   * @returns true while it is
   */
  private isBusy(): boolean {
    return this.phase.value === 'reading' || this.phase.value === 'loading'
  }

  async select(key: string): Promise<void> {
    // The backend does one read at a time (BUSY): while a log is read, or its charts and review are asked for, none is opened.
    if (this.isBusy()) {
      return
    }
    this.close()
    this.stopped.value = false
    this.open.value = key
    this.phase.value = 'reading'

    try {
      const summary = await this.deps.client.call('logs.local.read', { key })
      if (this.open.value !== key) {
        return
      }
      this.summary.value = summary
      this.phase.value = 'loading'
      await this.load(key, summary)
    } catch (error) {
      this.failed(key, error)
    }
  }

  /**
   * Asks for what the screen draws of a log that was read.
   *
   * @param key the log
   * @param summary what the read found
   */
  private async load(key: string, summary: LocalLogSummary): Promise<void> {
    // A log that is not verified is not looked into: its bytes are not known to be the vehicle's, so no modes, no series and no
    // review, and the screen says why (and offers to download it again).
    if (summary.verified) {
      await this.loadModes(key)
      await this.loadReview(key)
      await this.loadSeries(key, summary)
    } else {
      this.reviewMissing.value = 'not-verified'
    }

    if (this.open.value === key) {
      this.phase.value = 'ready'
      void this.refresh()
    }
  }

  /**
   * The changes of flight mode.
   *
   * @param key the log
   */
  private async loadModes(key: string): Promise<void> {
    const modes = await this.deps.client.call('logs.local.modes', { key })
    if (this.open.value === key) {
      this.modes.value = modes.modes
    }
  }

  /**
   * The review of a verified log.
   *
   * @param key the log
   */
  private async loadReview(key: string): Promise<void> {
    const review = await this.deps.client.call('logs.local.review', { key })
    if (this.open.value === key) {
      this.review.value = review.findings
    }
  }

  /**
   * The series of the charts (a log with no times has none to ask for).
   *
   * @param key the log
   * @param summary what the read found
   */
  private async loadSeries(key: string, summary: LocalLogSummary): Promise<void> {
    if (summary.firstUs === undefined || this.open.value !== key) {
      return
    }
    const answer = await this.deps.client.call('logs.local.series', { key, series: [...FLIGHT_SERIES], buckets: PARTS })
    if (this.open.value === key) {
      this.series.value = drawn(answer, asNumber(summary.firstUs))
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
    this.progress.value = null
    this.summary.value = null
    this.modes.value = []
    this.series.value = {}
    this.review.value = null
    this.reviewMissing.value = null
  }
}

/**
 * The flight logs on this computer.
 *
 * @param deps the client
 * @returns the model
 */
export function useFlights(deps: FlightsDeps): FlightsModel {
  return new Flights(deps)
}
