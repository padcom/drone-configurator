// The RC control of the mock backend: what the real one (apps/backend/rc.pi) says to the page, with a vehicle that is not
// there. A subscription to `rc.control` is a control; it is refused (the subscription ends with the code) for no vehicle,
// a vehicle whose armed state is not known, a control that already runs, and a vehicle that ignores overrides or never lets
// go of them. What a test of the page reads: the frames the "backend" was given (`rc.input`), whether the control is on, and
// how it ended (the page let go, or the "backend" did, see `end`). The watchdog is not simulated: a test that wants the
// backend to release says so with `end('SILENT')`.
import type { Envelope } from '@pico-desktop/protocol'
import type { RcInput, RcState } from '@/generated/app'

type Outgoing = Omit<Envelope, 'v'>

/** The channels a frame may carry, and the pulses of a channel that is overridden. */
const MAX_CHANNELS = 16
const MIN_PULSE = 800
const MAX_PULSE = 2200

/** What a test can read of the mock's RC control. */
export interface MockRcControl {
  /** Whether a control is on. */
  on: () => boolean
  /** The frames that counted (a new `seq`), in order, as the "backend" sent them (the throttle raised to its minimum). */
  frames: () => RcInput[]
  /** How many controls began, and how many ended because the page let go. */
  began: () => number
  /** What the page asked the last control for (`rc.control`'s params: `rudderArm`, `throttle`), or null before the first. */
  params: () => Record<string, unknown> | null
  /** How many ended because the page let go. */
  released: () => number
  /** The backend ends the control by itself (the link was lost, the page was silent ...): `released` with this reason. */
  end: (why: string) => void
  /** The backend says `on` again with the count of yaw pulses it held back (it does when the count changes). */
  tellHeld: (count: number) => void
  /** What `RC_OVERRIDE_TIME` is on the mock's vehicle (default 3): 0 or less is refused with `OVERRIDE_DISABLED`. */
  overrideTime: (seconds: number) => void
  /** Whether the mock's link is a simulator (default true): when it is not, a control is refused with `NOT_SIMULATOR`. */
  simulator: (is: boolean) => void
  /** Whether `rc.allow` is on in the mock backend's own settings (default true): when it is not, `NOT_ALLOWED`. */
  allowed: (is: boolean) => void
  /** The pulse the throttle channel is never sent under (default 1000), and which channel it is (default 3). */
  throttle: (channel: number, least: number) => void
}

/** The RC control of the mock. */
export class MockRc {
  private subscription: number | null = null
  private sent: RcInput[] = []
  private lastSeq = -1
  private clamped = 0
  private began = 0
  private asked: Record<string, unknown> | null = null
  private released = 0
  private overrideTime = 3
  private simulator = true
  private allowed = true
  private throttleChannel = 3
  private throttleMin = 1000

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
  control(): MockRcControl {
    return {
      on: () => this.subscription !== null,
      frames: () => [...this.sent],
      began: () => this.began,
      params: () => this.asked,
      released: () => this.released,
      end: why => this.finish(why),
      tellHeld: count => {
        this.tell({ state: 'on', throttleChannel: this.throttleChannel, throttleMin: this.throttleMin, held: count })
      },
      overrideTime: seconds => { this.overrideTime = seconds },
      simulator: is => { this.simulator = is },
      allowed: is => { this.allowed = is },
      throttle: (channel, least) => {
        this.throttleChannel = channel
        this.throttleMin = least
      },
    }
  }

  /**
   * A subscription to `rc.control`.
   *
   * @param e the request
   */
  subscribe(e: Envelope): void {
    const s = e.id!
    this.send({ k: 'response', id: s, s })
    this.asked = typeof e.p === 'object' && e.p !== null ? { ...(e.p as Record<string, unknown>) } : {}
    const refusal = this.refusal()
    if (refusal !== null) {
      this.send({ k: 'unsubscribe', s, err: { code: refusal, message: 'refused' } })

      return
    }
    this.subscription = s
    this.sent = []
    this.lastSeq = -1
    this.clamped = 0
    this.began += 1
    this.tell({ state: 'on', throttleChannel: this.throttleChannel, throttleMin: this.throttleMin })
  }

  /**
   * Why a control may not begin, or null.
   *
   * @returns the code
   */
  private refusal(): string | null {
    const checks: [boolean, string][] = [
      [!this.connected(), 'NOT_CONNECTED'],
      [!this.simulator, 'NOT_SIMULATOR'],
      [!this.allowed, 'NOT_ALLOWED'],
      [this.armedState() === null, 'STATE_UNKNOWN'],
      [this.subscription !== null, 'BUSY'],
      [this.overrideTime <= 0, 'OVERRIDE_DISABLED'],
    ]

    return checks.find(([failed]) => failed)?.[1] ?? null
  }

  /**
   * The page's sticks.
   *
   * @param p the frame
   * @param ok answers the call
   * @param fail refuses it
   */
  input(p: RcInput | null, ok: (p: null) => void, fail: (code: string, message: string) => void): void {
    if (this.subscription === null) {
      fail('NOT_RUNNING', 'RC control is not on')
    } else if (p === null || !this.valid(p)) {
      fail('INVALID_VALUE', 'a frame of at most 16 pulses, each 800 to 2200 µs or 0')
    } else {
      this.take(p)
      ok(null)
    }
  }

  /**
   * Whether a frame is within the limits.
   *
   * @param p the frame
   * @returns true when it is
   */
  private valid(p: RcInput): boolean {
    return p.channels.length <= MAX_CHANNELS && p.channels.every(c => c === 0 || (c >= MIN_PULSE && c <= MAX_PULSE))
  }

  /**
   * Keeps a frame that is new, as the backend sends it.
   *
   * @param p the frame
   */
  private take(p: RcInput): void {
    if (p.seq > this.lastSeq) {
      this.lastSeq = p.seq
      this.sent.push({ seq: p.seq, channels: p.channels.map((c, i) => this.held(i, c)) })
    }
  }

  /**
   * A pulse as the backend sends it: the throttle channel is never under its minimum.
   *
   * @param index the channel's index
   * @param pulse the pulse the page gave
   * @returns the pulse
   */
  private held(index: number, pulse: number): number {
    if (index === this.throttleChannel - 1 && pulse !== 0 && pulse < this.throttleMin) {
      this.clamped += 1

      return this.throttleMin
    }

    return pulse
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
    }
  }

  /**
   * The control ends by itself.
   *
   * @param why the reason
   */
  private finish(why: string): void {
    const s = this.subscription
    if (s === null) {
      return
    }
    this.tell({ state: 'released', why, sent: this.sent.length, clamped: this.clamped, confirmed: true })
    this.send({ k: 'unsubscribe', s })
    this.subscription = null
  }

  /**
   * Tells the page how the control is.
   *
   * @param state the state
   */
  private tell(state: RcState): void {
    if (this.subscription !== null) {
      this.send({ k: 'event', n: 'rc.control', s: this.subscription, p: state })
    }
  }

  /** The mock restarts: the control is gone. */
  reset(): void {
    this.subscription = null
  }
}
