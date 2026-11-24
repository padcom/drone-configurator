// The simulator's own truth, read beside the app: a second MAVLink reader on SITL's spare port (SERIAL2) that asks for
// ArduPilot's SIM_STATE (where the simulated vehicle really is, how fast it moves and how it is turned, straight from the
// physics model, before any sensor or estimator) and keeps what it says with the time it came. A test compares what the app
// shows with it at the same moment (`at`). It also keeps what the vehicle itself reports of its GPS (GPS_RAW_INT), to tell what
// the vehicle said from what an app would make up.
import type { Socket } from 'node:net'
import {
  MAV_AUTOPILOT_ARDUPILOTMEGA, MSG_GPS_RAW_INT, MSG_SIM_STATE, FrameReader, type Frame, type GpsRaw, type SimState, asGpsRaw,
  asHeartbeat, asSimState, encodeCommandLong,
} from './mavlink-wire'
import { connect } from './sitl'

const MAV_CMD_SET_MESSAGE_INTERVAL = 511

/** How often SIM_STATE is asked for: 50 a second, so that a moment between two is at most 20 ms from either. */
const INTERVAL_US = 20_000

/** How often GPS_RAW_INT is asked for: 5 a second, as often as the simulated GPS updates (SIM_GPS1_HZ). */
const GPS_INTERVAL_US = 200_000

/** How much of it is kept (ms): enough for a short flight. */
const KEEP_MS = 600_000

/** One SIM_STATE, with when it came (ms since 1970, the clock the page has too). */
export interface TruthSample {
  /**
   *
   */
  at: number
  /**
   *
   */
  state: SimState
}

/**
 * A value between two, `share` of the way from the first.
 *
 * @param a the first
 * @param b the second
 * @param share 0 to 1
 * @returns the value
 */
function between(a: number, b: number, share: number): number {
  return a + (b - a) * share
}

/**
 * The difference between two angles, the short way round.
 *
 * @param a degrees
 * @param b degrees
 * @returns a - b, from -180 to 180
 */
export function angleDifference(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}

/**
 * An angle between two, the short way round.
 *
 * @param a the first, degrees
 * @param b the second, degrees
 * @param share 0 to 1
 * @returns the angle, degrees
 */
function angleBetween(a: number, b: number, share: number): number {
  return a + angleDifference(b, a) * share
}

/**
 * The state between two samples.
 *
 * @param a the earlier
 * @param b the later
 * @param share 0 to 1: how far from the earlier
 * @returns the state
 */
export function interpolate(a: SimState, b: SimState, share: number): SimState {
  const linear = (key: 'lat' | 'lon' | 'alt' | 'vn' | 've' | 'vd' | 'roll' | 'pitch') => between(a[key], b[key], share)

  return {
    lat: linear('lat'), lon: linear('lon'), alt: linear('alt'), vn: linear('vn'), ve: linear('ve'), vd: linear('vd'),
    roll: linear('roll'), pitch: linear('pitch'), yaw: angleBetween(a.yaw, b.yaw, share),
  }
}

/**
 * The index of the last sample at or before a moment (binary search).
 *
 * @param samples the samples, oldest first
 * @param at the moment
 * @returns the index, or -1 when every sample is later
 */
function lastBefore(samples: readonly TruthSample[], at: number): number {
  const timeOf = (index: number) => samples[index]?.at ?? 0
  let low = 0
  let high = samples.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (timeOf(middle) <= at) {
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return high
}

/**
 * The truth at a moment, between the samples around it.
 *
 * @param samples the samples, oldest first
 * @param at the moment
 * @param gapMs how far apart the two may be for a moment between them to count
 * @returns the state, or undefined when the moment is not between two samples close enough
 */
export function truthAt(samples: readonly TruthSample[], at: number, gapMs: number): SimState | undefined {
  const index = lastBefore(samples, at)
  const before = samples[index]
  const after = samples[index + 1]
  if (!before || !after || after.at - before.at > gapMs) {
    return undefined
  }

  return interpolate(before.state, after.state, (at - before.at) / (after.at - before.at))
}

/** The reader. */
export class SimTruth {
  /** What came, oldest first. */
  readonly samples: TruthSample[] = []
  /** What the vehicle reported of its GPS, oldest first (the last 1000). */
  readonly gps: GpsRaw[] = []
  readonly #reader = new FrameReader()
  #asked = false

  private constructor(private readonly socket: Socket) {
    socket.on('data', (data: Buffer) => this.#take(data))
  }

  /**
   * Connects to the spare port, asks for SIM_STATE and waits until it comes.
   *
   * @param port SITL's spare port (`Sitl.spare.port`)
   * @param timeoutMs how long it may take
   * @returns the reader. Stop it.
   * @throws {Error} when no SIM_STATE came in time
   */
  static async start(port: number, timeoutMs = 20_000): Promise<SimTruth> {
    const truth = new SimTruth(await connect(port, timeoutMs, () => true))
    if (!await truth.#arrives(timeoutMs)) {
      truth.stop()
      throw new Error(`SITL sent no SIM_STATE on port ${port} within ${timeoutMs} ms`)
    }

    return truth
  }

  /**
   * Waits for the first SIM_STATE.
   *
   * @param timeoutMs how long
   * @returns whether it came
   */
  async #arrives(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (this.samples.length === 0 && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop -- one look after the other
      await new Promise(resolve => {
        setTimeout(resolve, 100)
      })
    }

    return this.samples.length > 0
  }

  /**
   * The latest truth.
   *
   * @returns it
   * @throws {Error} before any came
   */
  latest(): SimState {
    const last = this.samples.at(-1)
    if (!last) {
      throw new Error('no SIM_STATE yet')
    }

    return last.state
  }

  /**
   * The truth at a moment.
   *
   * @param at the moment (ms since 1970)
   * @returns the state, or undefined when it is not between two samples 100 ms apart at most
   */
  at(at: number): SimState | undefined {
    return truthAt(this.samples, at, 100)
  }

  /**
   * The samples between two moments.
   *
   * @param from the first moment (ms since 1970)
   * @param to the last
   * @returns the samples, oldest first
   */
  between(from: number, to: number): TruthSample[] {
    return this.samples.slice(lastBefore(this.samples, from) + 1, lastBefore(this.samples, to) + 1)
  }

  /** Closes the connection. */
  stop(): void {
    this.socket.destroy()
  }

  /**
   * Reads what came: asks for SIM_STATE on the first heartbeat, and keeps each SIM_STATE.
   *
   * @param data the bytes
   */
  #take(data: Buffer): void {
    const now = Date.now()
    for (const frame of this.#reader.push(data)) {
      this.#askOnce(frame)
      this.#keep(frame, now)
    }
    this.#forget(now - KEEP_MS)
  }

  /**
   * Keeps a SIM_STATE.
   *
   * @param frame a frame that came
   * @param now when it came
   */
  #keep(frame: Frame, now: number): void {
    const state = asSimState(frame)
    if (state) {
      this.samples.push({ at: now, state })
    }
    const gps = asGpsRaw(frame)
    if (gps) {
      this.gps.push(gps)
      this.gps.splice(0, this.gps.length - 1000)
    }
  }

  /**
   * Forgets what came before a moment.
   *
   * @param before the moment
   */
  #forget(before: number): void {
    const first = this.samples.findIndex(sample => sample.at >= before)
    this.samples.splice(0, first < 0 ? 0 : first)
  }

  /**
   * Asks the vehicle for SIM_STATE, once, when its heartbeat says who it is.
   *
   * @param frame a frame that came
   */
  #askOnce(frame: Frame): void {
    const heartbeat = asHeartbeat(frame)
    if (this.#asked || heartbeat?.autopilot !== MAV_AUTOPILOT_ARDUPILOTMEGA) {
      return
    }
    this.#asked = true
    const target = { systemId: heartbeat.systemId, componentId: heartbeat.componentId }
    this.socket.write(encodeCommandLong(target, MAV_CMD_SET_MESSAGE_INTERVAL, [MSG_SIM_STATE, INTERVAL_US]))
    this.socket.write(encodeCommandLong(target, MAV_CMD_SET_MESSAGE_INTERVAL, [MSG_GPS_RAW_INT, GPS_INTERVAL_US]))
  }
}
