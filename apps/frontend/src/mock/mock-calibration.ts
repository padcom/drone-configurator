// The calibration of the mock vehicle (`calibration.*` in packages/contracts/app.cddl), with the backend's rules: refused
// while the vehicle is armed (or not known to be disarmed), one calibration at a time, a position taken only when it is the
// one asked for, a compass result kept only when it is accepted, and a calibration that ends says why in `result`. The
// accelerometer asks for its six positions; the compass has two compasses that advance by a quarter at a time and then wait
// for the decision.
import type { Envelope } from '@pico-desktop/protocol'
import type { CalibrationCompass, CalibrationKind, CalibrationResult, CalibrationStart, CalibrationState } from '@/generated/app'

type Reply = (p: Envelope['p']) => void
type Fail = (code: string, message: string) => void
type Refusal = [code: string, message: string]
type Report = NonNullable<CalibrationCompass['report']>

/** How the mock calibrates. */
export interface MockCalibrationOptions {
  /** How far apart its steps are (ms). */
  intervalMs?: number
  /** The position (1 to 6) at which the accelerometer calibration fails, as the vehicle would say. */
  failAt?: number
  /** The status the compasses end in instead of SUCCESS. */
  compassStatus?: string
}

/** The offsets the mock's compass report gives (milligauss). */
const OFFSETS = [12.5, -4.25, 8]

/** The parameters an accepted compass calibration changes (the first compass's offsets). */
const OFFSET_PARAMS = ['COMPASS_OFS_X', 'COMPASS_OFS_Y', 'COMPASS_OFS_Z']

/** Where the mock transmitter rests (µs): roll, pitch and yaw centred, the throttle low, then four switches. */
const RADIO_CHANNELS = [1500, 1500, 1000, 1500, 1000, 1000, 1500, 1000]

/** What the vehicle says when the level is set. */
const TRIM_TEXT = 'Trim OK: roll=0.01 pitch=-0.01 yaw=0.00'

/**
 * The completion mask at `percent`: the first `percent * 80 / 100` bits are lit.
 *
 * @param percent how far the compass is
 * @returns the 10 bytes
 */
function maskOf(percent: number): number[] {
  const lit = Math.floor(percent * 80 / 100)

  return Array.from({ length: 10 }, (_unused, byte) => {
    let value = 0
    for (let bit = 0; bit < 8; bit += 1) {
      value |= byte * 8 + bit < lit ? 1 << bit : 0
    }

    return value
  })
}

/**
 * The report of a compass.
 *
 * @param ok whether it succeeded
 * @returns the report
 */
function reportOf(ok: boolean): Report {
  return {
    ok,
    fitness: ok ? 12.5 : 0,
    offsets: OFFSETS,
    diagonals: [1, 1, 1],
    offDiagonals: [0, 0, 0],
    oldOrientation: 0,
    newOrientation: 0,
    orientationConfidence: 0,
    scale: 1,
    accepted: false,
  }
}

/**
 * Why a calibration may not begin for the armed state the vehicle has.
 *
 * @param armed whether it is armed; undefined or null when that is not known (it counts as armed)
 * @returns the code and the words, or null
 */
function armedRefusal(armed: boolean | undefined | null): Refusal | null {
  if (armed === undefined || armed === null) {
    return ['STATE_UNKNOWN', 'the vehicle\'s state is unknown (no heartbeat for 3 s)']
  }

  return armed ? ['ARMED', 'the vehicle is armed: disarm it to calibrate'] : null
}

/**
 * Why a position is refused: the vehicle is not asking for it.
 *
 * @param asked the position asked for now (0: none)
 * @param position the position the page says the vehicle is in
 * @returns the code and the words, or null
 */
function askedRefusal(asked: number, position: number): Refusal | null {
  return asked === 0 || position !== asked ? ['NOT_ASKED', 'the vehicle is not asking for that position'] : null
}

/**
 * Whether a compass is among those a mask names (0 names them all).
 *
 * @param mask the mask
 * @param id the compass
 * @returns true if it is
 */
function named(mask: number, id: number): boolean {
  return mask === 0 || ((mask >> id) & 1) !== 0
}

/**
 * The state of a compass at `percent`.
 *
 * @param id the compass
 * @param percent how far it is
 * @param status the status it ends in
 * @returns the compass
 */
function compassAt(id: number, percent: number, status: string): CalibrationCompass {
  const done = percent >= 100
  const running = percent >= 50 ? 'RUNNING_STEP_TWO' : 'RUNNING_STEP_ONE'
  const compass: CalibrationCompass = { id, status: done ? status : running, percent, attempt: 1, mask: maskOf(percent) }
  if (done) {
    compass.report = reportOf(status === 'SUCCESS')
  }

  return compass
}

/**
 * The compasses a decision keeps: those named that succeeded.
 *
 * @param compasses the compasses
 * @param mask the mask the page sent
 * @returns the compasses that are kept
 */
function keptBy(compasses: readonly CalibrationCompass[], mask: number): CalibrationCompass[] {
  return compasses.filter(c => c.report?.ok === true && named(mask, c.id))
}

/**
 * A compass marked as accepted, when it is among `kept`.
 *
 * @param compass the compass
 * @param kept the compasses that were kept
 * @returns the compass
 */
function marked(compass: CalibrationCompass, kept: readonly CalibrationCompass[]): CalibrationCompass {
  return kept.includes(compass) && compass.report ? { ...compass, report: { ...compass.report, accepted: true } } : compass
}

/** The mock's calibration. */
export class MockCalibration {
  private state: CalibrationState = { state: 'idle', texts: [] }
  private timer: ReturnType<typeof setInterval> | undefined

  /**
   * Makes it.
   *
   * @param send puts an envelope on the link to the interface
   * @param options how it calibrates
   * @param armed the vehicle's armed state: undefined or null when it is not known
   * @param announce tells the interface that a parameter changed on the vehicle
   */
  constructor(
    private readonly send: (e: Omit<Envelope, 'v'>) => void,
    private readonly options: MockCalibrationOptions,
    private readonly armed: () => boolean | undefined | null,
    private readonly announce: (id: string, value: number) => void,
  ) {}

  /**
   * Whether a calibration is going on.
   *
   * @returns true from the start until it ends
   */
  private get active(): boolean {
    return ['starting', 'running', 'review'].includes(this.state.state)
  }

  /**
   * The compasses of the calibration, as the vehicle last said.
   *
   * @returns the compasses
   */
  private get compasses(): CalibrationCompass[] {
    return this.state.compasses ?? []
  }

  /**
   * The position the vehicle asks for now.
   *
   * @returns the position, 0 for none
   */
  private get asked(): number {
    return this.state.accel?.position ?? 0
  }

  /**
   * How far apart the steps are.
   *
   * @returns milliseconds
   */
  private get every(): number {
    return this.options.intervalMs ?? 25
  }

  /**
   * Tells the interface where the calibration is.
   *
   * @param next the new state
   */
  private tell(next: CalibrationState): void {
    this.state = next
    this.send({ k: 'event', n: 'calibration.progress', p: next as unknown as Envelope['p'] })
  }

  /**
   * Ends the calibration.
   *
   * @param result how it ended
   */
  private finish(result: CalibrationResult): void {
    clearInterval(this.timer)
    this.timer = undefined
    const next: CalibrationState = { ...this.state, state: 'finished', result }
    if (next.accel) {
      next.accel = { ...next.accel, position: 0, confirming: false }
    }
    if (result.outcome !== 'success') {
      delete next.compasses
      delete next.radio
    }
    this.send({ k: 'event', n: 'calibration.result', p: result as unknown as Envelope['p'] })
    this.tell(next)
  }

  /**
   * Adds a text the vehicle said.
   *
   * @param text what it said
   */
  private say(text: string): void {
    this.state = { ...this.state, texts: [...this.state.texts, text].slice(-40) }
  }

  /**
   * Runs `step` once, in a moment.
   *
   * @param step what to do
   */
  private later(step: () => void): void {
    this.timer = setTimeout(step, this.every) as unknown as ReturnType<typeof setInterval>
  }

  /**
   * The error that refuses a start, if any.
   *
   * @returns the code and the words, or null
   */
  private refusal(): Refusal | null {
    return armedRefusal(this.armed()) ?? (this.active ? ['BUSY', 'a calibration is already running'] : null)
  }

  /**
   * `calibration.start`.
   *
   * @param ask what to start
   * @param ok answers with the state
   * @param fail answers with an error
   */
  start(ask: CalibrationStart, ok: Reply, fail: Fail): void {
    const refused = this.refusal()
    if (refused) {
      fail(...refused)

      return
    }
    this.state = { state: 'starting', kind: ask.kind, texts: [] }
    this.begin(ask)
    ok(this.state as unknown as Envelope['p'])
    this.tell(this.state)
  }

  /**
   * Begins what was asked for.
   *
   * @param ask what to start
   */
  private begin(ask: CalibrationStart): void {
    const starts: Record<CalibrationKind, () => void> = {
      accel: () => this.later(() => this.askFor(1)),
      level: () => this.later(() => this.setLevel()),
      radio: () => this.radio(),
      compass: () => this.compass(ask.compasses ?? 0),
    }
    starts[ask.kind]()
  }

  /** The level is set. */
  private setLevel(): void {
    this.say(TRIM_TEXT)
    this.finish({ kind: 'level', outcome: 'success', detail: TRIM_TEXT })
  }

  /**
   * The vehicle asks for a position.
   *
   * @param position the position, 1 to 6
   */
  private askFor(position: number): void {
    const placed = this.state.accel?.placed ?? []
    this.say(position === 1 ? 'Place vehicle level and press any key.' : `Place vehicle position ${position} and press any key.`)
    this.tell({ ...this.state, state: 'running', accel: { position, placed, confirming: false } })
  }

  /**
   * Why a confirmation is refused, if it is.
   *
   * @param position the position the page says the vehicle is in
   * @returns the code and the words, or null
   */
  private confirmRefusal(position: number): Refusal | null {
    if (!this.active || this.state.kind !== 'accel') {
      return ['NOT_RUNNING', 'no accelerometer calibration is running']
    }

    return askedRefusal(this.asked, position)
  }

  /**
   * `calibration.confirm`.
   *
   * @param position the position the page says the vehicle is in
   * @param ok answers with the state
   * @param fail answers with an error
   */
  confirm(position: number, ok: Reply, fail: Fail): void {
    const refused = this.confirmRefusal(position)
    if (refused) {
      fail(...refused)

      return
    }
    const before = this.state.accel?.placed ?? []
    this.tell({ ...this.state, accel: { position, placed: before, confirming: true } })
    this.later(() => this.taken(position, [...before, position]))
    ok(this.state as unknown as Envelope['p'])
  }

  /**
   * The vehicle has taken the sample of a position: it fails, ends, or asks for the next.
   *
   * @param position the position
   * @param placed the positions done, this one too
   */
  private taken(position: number, placed: number[]): void {
    this.state = { ...this.state, accel: { position, placed, confirming: false } }

    if (position === this.options.failAt) {
      this.say('Calibration FAILED')
      this.finish({ kind: 'accel', outcome: 'failed', code: 'FAILED', detail: 'Calibration FAILED' })
    } else if (position === 6) {
      this.say('Calibration successful')
      this.finish({ kind: 'accel', outcome: 'success', detail: 'Calibration successful' })
    } else {
      this.askFor(position + 1)
    }
  }

  /**
   * The compass calibration: two compasses advance by a quarter each step, then the results wait.
   *
   * @param mask the compasses to calibrate (0: all)
   */
  private compass(mask: number): void {
    const ids = [0, 1].filter(id => named(mask, id))
    let percent = 0
    this.timer = setInterval(() => {
      percent = Math.min(100, percent + 25)
      const status = this.options.compassStatus ?? 'SUCCESS'
      const compasses = ids.map(id => compassAt(id, percent, status))
      this.tell({ ...this.state, state: percent >= 100 ? 'review' : 'running', compasses })

      if (percent >= 100) {
        clearInterval(this.timer)
        this.timer = undefined
      }
    }, this.every)
  }

  /** The radio calibration: the sticks of a mock transmitter are moved a little further every step, and the user ends it. */
  private radio(): void {
    let step = 0
    this.timer = setInterval(() => {
      step += 1
      const reach = Math.min(500, step * 100)
      const mins = RADIO_CHANNELS.map(rest => Math.max(1000, rest - reach))
      const maxs = RADIO_CHANNELS.map(rest => Math.min(2000, rest + reach))
      this.tell({ ...this.state, state: 'running', radio: { mins, maxs, last: RADIO_CHANNELS, glitches: 0, readings: step } })
    }, this.every)
  }

  /**
   * `calibration.finish`.
   *
   * @param ok answers with the state
   * @param fail answers with an error
   */
  finishRadio(ok: Reply, fail: Fail): void {
    const refused = this.finishRefusal()
    if (refused) {
      fail(...refused)

      return
    }
    this.finish({ kind: 'radio', outcome: 'success', detail: 'the ranges were captured: write them to the parameters' })
    ok(this.state as unknown as Envelope['p'])
  }

  /**
   * Why a finish is refused, if it is: no radio calibration runs, or it has taken no reading in.
   *
   * @returns the code and the words, or null
   */
  private finishRefusal(): Refusal | null {
    if (!this.radioRuns) {
      return ['NOT_RUNNING', 'no radio calibration is running']
    }

    return this.readings === 0 ? ['NO_READINGS', 'no radio reading has been taken yet: move the sticks and switches first'] : null
  }

  /**
   * Whether a radio calibration runs (and not only starts).
   *
   * @returns true if it does
   */
  private get radioRuns(): boolean {
    return this.active && this.state.kind === 'radio' && this.state.state === 'running'
  }

  /**
   * How many readings the radio calibration has taken in.
   *
   * @returns the count
   */
  private get readings(): number {
    return this.state.radio?.readings ?? 0
  }

  /**
   * `calibration.accept`.
   *
   * @param mask the compasses to keep (0: all that succeeded)
   * @param ok answers with the state
   * @param fail answers with an error
   */
  accept(mask: number, ok: Reply, fail: Fail): void {
    const refused = this.acceptRefusal(mask)
    if (refused) {
      fail(...refused)

      return
    }
    const kept = keptBy(this.compasses, mask)
    OFFSET_PARAMS.forEach((id, i) => this.announce(id, OFFSETS[i] ?? 0))
    this.state = { ...this.state, compasses: this.compasses.map(c => marked(c, kept)) }
    this.finish({ kind: 'compass', outcome: 'success', detail: 'the results were kept: the new values are used after a reboot' })
    ok(this.state as unknown as Envelope['p'])
  }

  /**
   * Why an accept is refused, if it is: nothing waits for it, or no compass succeeded.
   *
   * @param mask the compasses to keep (0: all that succeeded)
   * @returns the code and the words, or null
   */
  private acceptRefusal(mask: number): Refusal | null {
    if (this.state.state !== 'review' || this.state.kind !== 'compass') {
      return ['NOT_RUNNING', 'no compass calibration is waiting to be accepted']
    }
    if (keptBy(this.compasses, mask).length === 0) {
      this.say('Compass calibration could not be kept')

      return ['NOT_ACCEPTED', 'the vehicle did not accept the results (did any compass succeed?)']
    }

    return null
  }

  /**
   * `calibration.cancel`.
   *
   * @param ok answers with the state
   */
  cancel(ok: Reply): void {
    if (this.active) {
      this.finish({ kind: this.state.kind ?? 'accel', outcome: 'cancelled', code: 'CANCELLED', detail: 'cancelled' })
    }
    ok(this.state as unknown as Envelope['p'])
  }

  /**
   * `calibration.status`.
   *
   * @param ok answers with the state
   */
  status(ok: Reply): void {
    ok(this.state as unknown as Envelope['p'])
  }

  /** The session ended (the interface restarted): the calibration is over. */
  reset(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.state = { state: 'idle', texts: [] }
  }
}
