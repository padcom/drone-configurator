// The live response of the Tune screen (`tuning.stream`): the actual roll rate and the desired one, as the backend sends them,
// kept for the last seconds and nothing more. It talks to the backend through the client (docs/frontend-state.md). Nothing here
// makes a point up: a line is what came, a vehicle that did not take a request has no line, and old data says so (`stale`).
//
// The stream runs for as long as the Tune screen is shown (`start` when it is, `stop` when it is left): the backend asks the
// vehicle for the two messages when it starts, and gives the vehicle's message rates back when it ends, so the rates are the
// vehicle's own again.
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
import { type BackendClient, type Subscription, describeError } from '@/backend/client'
import type { TuningAsked, TuningBatch } from '@/generated/app'
import type { RatePoint } from '@/lib/tune/stepResponse'

/** How far back the points are kept (ms of the vehicle's clock): more than the chart shows and the step window looks at. */
export const KEEP_MS = 15_000

/** The most points a line keeps, whatever their spacing (the backend sends 50 a second at the most). */
export const KEEP_POINTS = 1000

/** The stream is old when nothing has come for this long (ms). */
export const STALE_MS = 1500

/** How often the clock that says "old" is looked at (ms). */
const TICK_MS = 500

/** The rate asked of the vehicle (Hz). */
const RATE_HZ = 25

/** Where the stream is: not asked for, asked, or on its way (the first batch came), or the backend would not (or ended it). */
export type StreamState = 'idle' | 'starting' | 'live' | 'ended'

/** What the stream needs from the rest of the interface. */
export interface TuningStreamDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The time now (ms since 1970), a parameter so that a test needs no waiting. */
  now?: () => number
}

/** The stream, as refs and actions. */
export interface TuningStreamModel {
  /** The actual roll rate (ATTITUDE), oldest first. */
  readonly actual: ShallowRef<RatePoint[]>
  /** The desired roll rate (ATTITUDE_TARGET), oldest first. */
  readonly desired: ShallowRef<RatePoint[]>
  /** How many points the backend dropped since the stream began, because it could not send them fast enough. */
  readonly dropped: ShallowRef<number>
  /** Whether the vehicle took the request for each message; null until it has said. */
  readonly asked: ShallowRef<TuningAsked | null>
  /** Where the stream is. */
  readonly state: ShallowRef<StreamState>
  /** Why the stream did not begin or ended (in words), or null. */
  readonly problem: ShallowRef<string | null>
  /** Whether what is shown is old: the stream is not running, or nothing came for a while. */
  readonly stale: ComputedRef<boolean>
  /** Asks the backend for the stream (does nothing when it runs). */
  start: () => void
  /** Ends the stream. The points stay (marked old) until the next one begins. */
  stop: () => void
}

/**
 * The time of the last point of a line.
 *
 * @param line the points
 * @returns the time, 0 for none
 */
function newestOf(line: RatePoint[]): number {
  return line.at(-1)?.t ?? 0
}

/**
 * The points of a line with new ones added, only the last seconds and at most KEEP_POINTS. A clock that goes back (the vehicle
 * restarted) begins the line again. A point whose rate or time is not a number is not kept.
 *
 * @param line what was kept
 * @param added what came
 * @returns the line
 */
export function appended(line: RatePoint[], added: RatePoint[]): RatePoint[] {
  const real = added.filter(point => Number.isFinite(point.v) && Number.isFinite(point.t))
  const restarted = real.length > 0 && line.length > 0 && newestOf(real.slice(0, 1)) < newestOf(line)
  const joined = [...(restarted ? [] : line), ...real]
  const newest = newestOf(joined)

  return joined.filter(point => newest - point.t <= KEEP_MS).slice(-KEEP_POINTS)
}

/** The stream. */
class TuningStream implements TuningStreamModel {
  readonly actual = shallowRef<RatePoint[]>([])
  readonly desired = shallowRef<RatePoint[]>([])
  readonly dropped = shallowRef(0)
  readonly asked = shallowRef<TuningAsked | null>(null)
  readonly state = shallowRef<StreamState>('idle')
  readonly problem = shallowRef<string | null>(null)
  readonly stale: ComputedRef<boolean>
  /** When (ms since 1970) a point last came, and the time now (moved by a timer while the stream runs). */
  private readonly lastAt = shallowRef(0)
  private readonly clock = shallowRef(0)
  private subscription: Subscription | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  /**
   * Makes the stream.
   *
   * @param deps the client and the clock
   */
  constructor(private readonly deps: TuningStreamDeps) {
    this.stale = computed(() => this.state.value !== 'live' || this.clock.value - this.lastAt.value > STALE_MS)
  }

  /**
   * The time now.
   *
   * @returns ms since 1970
   */
  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  start(): void {
    if (this.subscription !== null) {
      return
    }
    this.state.value = 'starting'
    this.problem.value = null
    this.dropped.value = 0
    this.asked.value = null
    this.clock.value = this.now()
    const subscription = this.deps.client.subscribe('tuning.stream', { rateHz: RATE_HZ }, batch => this.take(batch), fault => {
      this.ended(subscription, fault === null ? null : describeError(fault))
    })
    this.subscription = subscription
    this.timer = setInterval(() => {
      this.clock.value = this.now()
    }, TICK_MS)
    void this.refused(subscription)
  }

  /**
   * Waits for the backend to accept the stream; when it does not, says why.
   *
   * @param subscription the subscription
   */
  private async refused(subscription: Subscription): Promise<void> {
    try {
      await subscription.ready
    } catch (error) {
      this.ended(subscription, describeError(error))
    }
  }

  /**
   * The stream is over (the backend ended it or would not begin it): what it says is kept, and the stream is not running.
   *
   * @param subscription the subscription that ended (one that is not the current is an older stream's news)
   * @param why the words, or null when it ended without a fault
   */
  private ended(subscription: Subscription, why: string | null): void {
    if (subscription !== this.subscription) {
      return
    }
    this.release()
    this.state.value = 'ended'
    this.problem.value = why
  }

  /** Lets go of the subscription and the clock. */
  private release(): void {
    this.subscription?.stop()
    this.subscription = null

    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  stop(): void {
    this.release()
    this.state.value = 'idle'
  }

  /**
   * A batch came: its points are kept, and what it says of what the vehicle took and what was dropped.
   *
   * @param batch what the backend sent
   */
  private take(batch: TuningBatch): void {
    this.state.value = 'live'
    this.dropped.value = Math.max(this.dropped.value, batch.dropped)
    this.asked.value = batch.asked

    if (batch.actual.length > 0 || batch.desired.length > 0) {
      this.actual.value = appended(this.actual.value, batch.actual)
      this.desired.value = appended(this.desired.value, batch.desired)
      this.lastAt.value = this.now()
      this.clock.value = this.lastAt.value
    }
  }
}

/**
 * Makes the stream.
 *
 * @param deps the client and the clock
 * @returns the refs and the actions
 */
export function useTuningStream(deps: TuningStreamDeps): TuningStreamModel {
  return new TuningStream(deps)
}
