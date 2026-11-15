// The Replay screen's model: a log on this computer is read, and then its track (the thinned positions, home, the events), its
// changes of flight mode and the two series the tiles show are asked for, one after the other (the backend reads one thing at a
// time, with progress and a way to stop). A log that is not verified is not looked into; a log with no position says so and why
// (nothing is drawn, never a line at 0, 0). The moment of the replay is not here: it is the page's (the clock of the screen).
import { type Ref, type ShallowRef, ref, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import { say } from '@/i18n/say'
import type { LocalLogSummary, ModeChange } from '@/generated/app'
import type { ChartPoint } from '@/lib/charts/chart'
import { asNumber, pointsOf } from '@/lib/logs/localLogs'
import { type Jump, type ReplayTrack, TILE_PARTS, jumpsOf, trackOf } from '@/lib/logs/replay'

/** What the model needs. */
export interface ReplayDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** How far the screen has got. */
export type ReplayPhase = 'idle' | 'reading' | 'loading' | 'ready' | 'unverified' | 'none' | 'failed'

/** The values the tiles show at the cursor, by `message.field`: the height above home and the voltage of the battery. */
export const TILE_SERIES = [
  { message: 'CTUN', field: 'Alt' },
  { message: 'BAT', field: 'Volt', whereField: 'Inst', whereValue: 0 },
] as const

/** The Replay model. */
export interface ReplayModel {
  /** The key of the log that is open, or null. */
  readonly open: Readonly<Ref<string | null>>
  /** How far it has got. */
  readonly phase: Readonly<Ref<ReplayPhase>>
  /** How far the read is, or null when it is not reading. */
  readonly progress: ShallowRef<{ bytes: number, total: number } | null>
  /** What the read found of the log. */
  readonly summary: ShallowRef<LocalLogSummary | null>
  /** The track, once it is there. */
  readonly track: ShallowRef<ReplayTrack | null>
  /** What to jump to. */
  readonly jumps: ShallowRef<Jump[]>
  /** The changes of flight mode. */
  readonly modes: ShallowRef<ModeChange[]>
  /** The series of the tiles, by `message.field`. */
  readonly series: ShallowRef<Record<string, ChartPoint[]>>
  /** The words of the backend for a log that has no position. */
  readonly noneWhy: Readonly<Ref<string | null>>
  /** Whether the last log that was being opened was stopped. */
  readonly stopped: Readonly<Ref<boolean>>
  /** What the last call that failed said. */
  readonly error: ShallowRef<string | null>
  /** Opens a log: reads it and asks for what the replay shows. */
  choose: (key: string) => Promise<void>
  /** Stops the pass that is under way. */
  cancel: () => Promise<void>
  /** Closes the log. */
  close: () => void
}

/** The Replay model. */
class Replay implements ReplayModel {
  readonly open = ref<string | null>(null)
  readonly phase = ref<ReplayPhase>('idle')
  readonly progress = shallowRef<{ bytes: number, total: number } | null>(null)
  readonly summary = shallowRef<LocalLogSummary | null>(null)
  readonly track = shallowRef<ReplayTrack | null>(null)
  readonly jumps = shallowRef<Jump[]>([])
  readonly modes = shallowRef<ModeChange[]>([])
  readonly series = shallowRef<Record<string, ChartPoint[]>>({})
  readonly noneWhy = ref<string | null>(null)
  readonly stopped = ref(false)
  readonly error = shallowRef<string | null>(null)

  /**
   * Makes the model, and listens to the progress of passes.
   *
   * @param deps the client
   */
  constructor(private readonly deps: ReplayDeps) {
    deps.client.onEvent('logs.local.progress', progress => {
      if (progress.key === this.open.value && ['reading', 'loading'].includes(this.phase.value)) {
        this.progress.value = { bytes: asNumber(progress.bytes), total: asNumber(progress.total) }
      }
    })
  }

  async choose(key: string): Promise<void> {
    if (['reading', 'loading'].includes(this.phase.value)) {
      return
    }
    this.close()
    this.stopped.value = false
    this.open.value = key
    this.phase.value = 'reading'

    try {
      const summary = await this.deps.client.call('logs.local.read', { key })
      if (this.open.value === key) {
        this.summary.value = summary
        await this.load(key, summary)
      }
    } catch (error) {
      this.failed(key, error)
    }
  }

  /**
   * Asks for what the replay shows of a log that was read.
   *
   * @param key the log
   * @param summary what the read found
   */
  private async load(key: string, summary: LocalLogSummary): Promise<void> {
    // A log whose bytes are not known to be the vehicle's is not looked into (as in Flights).
    if (!summary.verified) {
      this.phase.value = 'unverified'

      return
    }
    this.phase.value = 'loading'

    if (summary.firstUs === undefined) {
      this.none(say('logs.replay.none.noTimes'))

      return
    }
    await this.loadTrack(key, asNumber(summary.firstUs))
  }

  /**
   * The modes, the track and the series of the tiles of a verified log that has times.
   *
   * @param key the log
   * @param first the time of the first message of the log (microseconds)
   */
  private async loadTrack(key: string, first: number): Promise<void> {
    const { modes } = await this.deps.client.call('logs.local.modes', { key })
    const answer = await this.trackOrNone(key)
    if (answer === null || this.open.value !== key) {
      return
    }
    this.modes.value = modes
    this.track.value = trackOf(answer, first)
    this.jumps.value = jumpsOf(answer, modes, first)
    await this.loadSeries(key, first)

    if (this.open.value === key) {
      this.phase.value = 'ready'
      this.progress.value = null
    }
  }

  /**
   * The track; a log with no position is not an error: the screen says why there is nothing to draw.
   *
   * @param key the log
   * @returns the answer, or null when there is no track
   */
  private async trackOrNone(key: string) {
    try {
      return await this.deps.client.call('logs.local.track', { key })
    } catch (error) {
      const backend = toBackendError(error)
      if (backend.code === 'UNAVAILABLE' && this.open.value === key) {
        this.none(backend.message)

        return null
      }
      throw error
    }
  }

  /**
   * Says there is nothing to draw, and why.
   *
   * @param why the words
   */
  private none(why: string): void {
    this.noneWhy.value = why
    this.phase.value = 'none'
    this.progress.value = null
  }

  /**
   * The series of the tiles.
   *
   * @param key the log
   * @param first the time of the first message of the log (microseconds)
   */
  private async loadSeries(key: string, first: number): Promise<void> {
    const answer = await this.deps.client.call('logs.local.series', { key, series: [...TILE_SERIES], buckets: TILE_PARTS })
    const drawn: Record<string, ChartPoint[]> = {}
    for (const result of answer.series) {
      drawn[`${result.message}.${result.field}`] = pointsOf(result, answer, first)
    }

    if (this.open.value === key) {
      this.series.value = drawn
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
    this.track.value = null
    this.jumps.value = []
    this.modes.value = []
    this.series.value = {}
    this.noneWhy.value = null
    this.error.value = null
  }
}

/**
 * The Replay model.
 *
 * @param deps the client
 * @returns the model
 */
export function useReplay(deps: ReplayDeps): ReplayModel {
  return new Replay(deps)
}
