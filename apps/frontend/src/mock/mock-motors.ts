// The motor test of the mock backend: what the real one (apps/backend/motors.pi) says to the page, with a vehicle that is not
// there. A subscription to `motors.test` is a test; it is refused (the subscription ends with the code) for a vehicle that is
// armed or not known, a test that already runs, and a motor or throttle outside the limits. What a test of the page reads: how
// many tests began, what runs, how many "still held" came, and whether the test was ended (the page let go, or the "backend" did,
// see `end`).
import type { Envelope } from '@pico-desktop/protocol'
import type { MotorTestParams, MotorTestState } from '@/generated/app'

type Outgoing = Omit<Envelope, 'v'>

/** What a test can read of the mock's motor test. */
export interface MockMotorsControl {
  /** The test that runs, or null. */
  running: () => { motor: number, throttle: number } | null
  /** How many tests began, how many "still held" came, and how many ended because the page let go. */
  began: () => number
  /**
   *
   */
  holds: () => number
  /**
   *
   */
  released: () => number
  /** The backend ends the test that runs by itself (the link was lost, the page was silent ...): `stopped` with this reason. */
  end: (why: string) => void
}

/**
 * Whether a test asks for a motor (1 to 12) or a throttle (1 to 20 %) the backend refuses.
 *
 * @param ask what was asked
 * @returns true if it is outside the limits, or there is nothing asked
 */
function outOfLimits(ask: MotorTestParams | null): boolean {
  const within = (value: number, least: number, most: number) => value >= least && value <= most

  return ask === null || !within(ask.motor, 1, 12) || !within(ask.throttle, 1, 20)
}

/** The motor test of the mock. */
export class MockMotors {
  private subscription: number | null = null
  private current: { motor: number, throttle: number } | null = null
  private began = 0
  private holds = 0
  private released = 0

  /**
   * Makes it.
   *
   * @param send how the mock sends to the page
   * @param armedState the armed state the vehicle reports: true or false, or null when it is not known
   * @param connected whether a vehicle is connected
   */
  constructor(
    private readonly send: (e: Outgoing) => void,
    private readonly armedState: () => boolean | null,
    private readonly connected: () => boolean,
  ) {}

  /**
   * What a test reads.
   *
   * @returns the controls
   */
  control(): MockMotorsControl {
    return {
      running: () => this.current,
      began: () => this.began,
      holds: () => this.holds,
      released: () => this.released,
      end: why => this.finish(why),
    }
  }

  /**
   * A subscription to `motors.test`.
   *
   * @param e the request
   */
  subscribe(e: Envelope): void {
    const s = e.id!
    const ask = e.p as MotorTestParams | null
    this.send({ k: 'response', id: s, s })
    const refusal = this.refusal(ask)
    if (refusal !== null || ask === null) {
      this.send({ k: 'unsubscribe', s, err: { code: refusal ?? 'INVALID_VALUE', message: 'refused' } })

      return
    }
    this.subscription = s
    this.current = { motor: ask.motor, throttle: ask.throttle }
    this.began += 1
    this.tell({ state: 'running', motor: ask.motor })
  }

  /**
   * Why a test may not begin, or null.
   *
   * @param ask what was asked
   * @returns the code
   */
  private refusal(ask: MotorTestParams | null): string | null {
    const armed = this.armedState()
    const checks: [boolean, string][] = [
      [outOfLimits(ask), 'INVALID_VALUE'],
      [!this.connected(), 'NOT_CONNECTED'],
      [armed === null, 'STATE_UNKNOWN'],
      [armed === true, 'ARMED'],
      [this.current !== null, 'BUSY'],
    ]

    return checks.find(([failed]) => failed)?.[1] ?? null
  }

  /**
   * The page said it still holds.
   *
   * @param ok answers the call
   * @param fail refuses it
   */
  hold(ok: (p: null) => void, fail: (code: string, message: string) => void): void {
    if (this.current === null) {
      fail('NOT_RUNNING', 'no motor test is running')
    } else {
      this.holds += 1
      ok(null)
    }
  }

  /**
   * The page unsubscribed.
   *
   * @param s the subscription
   */
  unsubscribe(s: number): void {
    if (s === this.subscription) {
      this.released += 1
      this.subscription = null
      this.current = null
    }
  }

  /**
   * The test ends by itself.
   *
   * @param why the reason
   */
  private finish(why: string): void {
    const s = this.subscription
    const { current } = this
    if (s === null || current === null) {
      return
    }
    this.tell({ state: 'stopped', motor: current.motor, why, starts: 1, confirmed: true })
    this.send({ k: 'unsubscribe', s })
    this.subscription = null
    this.current = null
  }

  /**
   * Tells the page how the test is.
   *
   * @param state the state
   */
  private tell(state: MotorTestState): void {
    if (this.subscription !== null) {
      this.send({ k: 'event', n: 'motors.test', s: this.subscription, p: state })
    }
  }

  /** The mock restarts: the test is gone. */
  reset(): void {
    this.subscription = null
    this.current = null
  }
}
