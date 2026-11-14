// The Tune screen's live stream of the mock backend (`tuning.stream`): what the real one (apps/backend/tuningstream.pi) says to
// the page, with a vehicle that is not there. A subscription is the stream; it is refused (the subscription ends with the code)
// with no vehicle (`NOT_CONNECTED`), a rate outside 1 to 50 (`INVALID_VALUE`) and when one runs already (`BUSY`). The mock sends
// NOTHING by itself: a test pushes the batches it wants the page to get (`push`), so that no curve is made up here either, and
// reads how many streams began and whether one runs (the page must leave when the screen is left).
import type { Envelope } from '@pico-desktop/protocol'
import type { TuningBatch, TuningParams } from '@/generated/app'

type Outgoing = Omit<Envelope, 'v'>

/** What a test reads and does of the mock's tuning stream. */
export interface MockTuningControl {
  /** How many streams began. */
  began: () => number
  /** Whether a stream runs. */
  running: () => boolean
  /** The rate the running stream asked for (Hz), or null. */
  rateHz: () => number | null
  /** Sends a batch to the page that is subscribed (nothing when there is none). */
  push: (batch: TuningBatch) => void
  /** The backend ends the stream by itself (the link was lost ...) with this code. */
  end: (code: string) => void
}

/** The tuning stream of the mock. */
export class MockTuning {
  private subscription: number | null = null
  private asked: number | null = null
  private began = 0

  /**
   * Makes it.
   *
   * @param send how the mock sends to the page
   * @param connected whether a vehicle is connected
   */
  constructor(private readonly send: (e: Outgoing) => void, private readonly connected: () => boolean) {}

  /**
   * What a test reads and does.
   *
   * @returns the controls
   */
  control(): MockTuningControl {
    return {
      began: () => this.began,
      running: () => this.subscription !== null,
      rateHz: () => this.asked,
      push: batch => this.tell(batch),
      end: code => this.finish(code),
    }
  }

  /**
   * A subscription to `tuning.stream`.
   *
   * @param e the request
   */
  subscribe(e: Envelope): void {
    const s = e.id!
    const hz = (e.p as TuningParams | null)?.rateHz ?? 25
    this.send({ k: 'response', id: s, s })
    const code = this.refusal(hz)
    if (code !== null) {
      this.send({ k: 'unsubscribe', s, err: { code, message: 'refused' } })

      return
    }
    this.subscription = s
    this.asked = hz
    this.began += 1
  }

  /**
   * Why a stream may not begin, or null.
   *
   * @param hz the rate asked for
   * @returns the code
   */
  private refusal(hz: number): string | null {
    const checks: [boolean, string][] = [
      [hz < 1 || hz > 50, 'INVALID_VALUE'],
      [!this.connected(), 'NOT_CONNECTED'],
      [this.subscription !== null, 'BUSY'],
    ]

    return checks.find(([failed]) => failed)?.[1] ?? null
  }

  /**
   * The page unsubscribed.
   *
   * @param s the subscription
   */
  unsubscribe(s: number): void {
    if (s === this.subscription) {
      this.subscription = null
      this.asked = null
    }
  }

  /**
   * Sends a batch to the page.
   *
   * @param batch the batch
   */
  private tell(batch: TuningBatch): void {
    if (this.subscription !== null) {
      this.send({ k: 'event', n: 'tuning.stream', s: this.subscription, p: batch })
    }
  }

  /**
   * The stream ends by itself.
   *
   * @param code why
   */
  private finish(code: string): void {
    const s = this.subscription
    if (s !== null) {
      this.send({ k: 'unsubscribe', s, err: { code, message: 'ended' } })
      this.subscription = null
      this.asked = null
    }
  }

  /** The mock restarts: the stream is gone. */
  reset(): void {
    this.subscription = null
    this.asked = null
  }
}
