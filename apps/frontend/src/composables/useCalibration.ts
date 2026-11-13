// The calibration of the vehicle's sensors, as the Setup pages see it: the state the backend tells (`calibration.progress`),
// and the actions (`calibration.start`, `.confirm`, `.accept`, `.finish`, `.cancel`). One calibration runs at a time (the
// backend refuses a second). The state is the backend's: this keeps it, and never makes one up. A calibration that is under way
// when the link goes ends on the backend (it says so in the state it sends), and here at once: nothing is shown as running for
// a vehicle that is not connected.
import { type ComputedRef, type Ref, type ShallowRef, computed, shallowRef, watch } from 'vue'
import { type BackendClient, toBackendError } from '@/backend/client'
import type { CalibrationKind, CalibrationResult, CalibrationState, Connection, Telemetry } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'

/** Why no calibration can start now: no vehicle, an armed one, or one whose armed state is not known (it counts as armed). */
export type CalibrationBlock = 'offline' | 'armed' | 'unknown' | null

/** What the calibration needs from the rest of the interface. */
export interface CalibrationDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The vehicle's connection. */
  connection: Readonly<Ref<Connection>>
  /** The latest telemetry (the armed state is read from it). */
  telemetry: Readonly<Ref<Telemetry | null>>
}

/** What a compass calibration is started with. */
export interface CompassStart {
  /** The compasses (a bit for each); 0 or absent: all. */
  compasses?: number
  /** Let the vehicle keep the result by itself. Off unless asked. */
  autosave?: boolean
}

/** The calibration as refs and actions. */
export interface CalibrationModel {
  /** Where the calibration is (idle when none). */
  readonly state: ShallowRef<CalibrationState>
  /** How the last calibration ended, or null. */
  readonly result: ComputedRef<CalibrationResult | null>
  /** Whether one is going on (starting, running or waiting for the user's decision). */
  readonly running: ComputedRef<boolean>
  /** Why none can start now. */
  readonly blocked: ComputedRef<CalibrationBlock>
  /** The code of the last call that was refused or failed (`ARMED`, `BUSY`, `NOT_ASKED`, ...), or null. */
  readonly errorCode: ShallowRef<string | null>
  /** What the last refused call said, in words. */
  readonly errorMessage: ShallowRef<string | null>
  /** Whether a call is under way. */
  readonly calling: ShallowRef<boolean>
  /** Starts a calibration. */
  start: (kind: CalibrationKind, options?: CompassStart) => Promise<void>
  /** Says the vehicle is in `position` (the accelerometer's). */
  confirm: (position: number) => Promise<void>
  /** Keeps the compass results (of the compasses in `compasses`, all that succeeded when absent). */
  accept: (compasses?: number) => Promise<void>
  /** Ends the radio calibration: what it captured stays in the state, for the page to write. */
  finish: () => Promise<void>
  /** Cancels the calibration that runs (nothing is kept). */
  cancel: () => Promise<void>
  /** Asks the backend where it is (a page that is shown again, or after the backend restarted). */
  refresh: () => Promise<void>
  /** The vehicle is gone, or another one is there: forgets what was said. */
  reset: () => void
}

/** The state when nothing runs. */
const IDLE: CalibrationState = { state: 'idle', texts: [] }

/**
 * Why no calibration may start for a connection and an armed state.
 *
 * @param connected whether a vehicle is connected
 * @param armed whether it is armed; undefined when that is not known
 * @returns the reason, or null
 */
function blockOf(connected: boolean, armed: boolean | undefined): CalibrationBlock {
  if (!connected) {
    return 'offline'
  }
  if (armed === undefined) {
    return 'unknown'
  }

  return armed ? 'armed' : null
}

/** The calibration. */
class Calibration implements CalibrationModel {
  readonly state = shallowRef<CalibrationState>(IDLE)
  readonly errorCode = shallowRef<string | null>(null)
  readonly errorMessage = shallowRef<string | null>(null)
  readonly calling = shallowRef(false)
  readonly result: ComputedRef<CalibrationResult | null>
  readonly running: ComputedRef<boolean>
  readonly blocked: ComputedRef<CalibrationBlock>
  /** Goes up with every reset: an answer for an earlier vehicle is dropped. */
  private epoch = 0

  /**
   * Makes the model, and listens to what the backend tells of the calibration.
   *
   * @param deps the client, the connection and the telemetry
   */
  constructor(private readonly deps: CalibrationDeps) {
    this.result = computed(() => this.state.value.result ?? null)
    this.running = computed(() => ['starting', 'running', 'review'].includes(this.state.value.state))
    this.blocked = computed(() => blockOf(deps.connection.value.state === 'connected', armedOf(deps.telemetry.value)))
    deps.client.onEvent('calibration.progress', state => {
      this.state.value = state
    })
    // A link that is gone ends the calibration on the backend; nothing is shown as running meanwhile.
    watch(() => deps.connection.value.state, next => next !== 'connected' && this.running.value && this.ended())
  }

  /** The link is gone: the calibration is over, and says so until the backend's own word comes. */
  private ended(): void {
    const { kind } = this.state.value
    this.state.value = {
      ...this.state.value,
      state: 'finished',
      result: kind === undefined ? undefined : { kind, outcome: 'cancelled', code: 'LINK_LOST' },
    }
  }

  /**
   * Keeps what a call answered, when it is for this vehicle.
   *
   * @param epoch the vehicle the call was made for
   * @param answer the state it answered
   */
  private answered(epoch: number, answer: CalibrationState): void {
    if (epoch === this.epoch) {
      this.state.value = answer
    }
  }

  /**
   * Keeps a refusal as code and words, when it is for this vehicle.
   *
   * @param epoch the vehicle the call was made for
   * @param error what the call threw
   */
  private refused(epoch: number, error: unknown): void {
    if (epoch === this.epoch) {
      const { code, message } = toBackendError(error)
      this.errorCode.value = code
      this.errorMessage.value = message
    }
  }

  /**
   * Makes a call, and keeps the answer (the state) when it is for this vehicle; a refusal is kept as code and words.
   *
   * @param call makes the call
   */
  private async ask(call: () => Promise<CalibrationState>): Promise<void> {
    const { epoch } = this
    this.calling.value = true
    this.errorCode.value = null
    this.errorMessage.value = null

    try {
      this.answered(epoch, await call())
    } catch (error) {
      this.refused(epoch, error)
    } finally {
      this.calling.value = this.epoch === epoch ? false : this.calling.value
    }
  }

  async start(kind: CalibrationKind, options: CompassStart = {}): Promise<void> {
    await this.ask(() => this.deps.client.call('calibration.start', { kind, ...options }))
  }

  async confirm(position: number): Promise<void> {
    await this.ask(() => this.deps.client.call('calibration.confirm', { position }))
  }

  async accept(compasses?: number): Promise<void> {
    await this.ask(() => this.deps.client.call('calibration.accept', compasses === undefined ? {} : { compasses }))
  }

  async finish(): Promise<void> {
    await this.ask(() => this.deps.client.call('calibration.finish', null))
  }

  async cancel(): Promise<void> {
    await this.ask(() => this.deps.client.call('calibration.cancel', null))
  }

  async refresh(): Promise<void> {
    await this.ask(() => this.deps.client.call('calibration.status', null))
  }

  reset(): void {
    this.epoch += 1
    this.state.value = IDLE
    this.errorCode.value = null
    this.errorMessage.value = null
    this.calling.value = false
  }
}

/**
 * Makes the calibration.
 *
 * @param deps the client, the connection and the telemetry
 * @returns the model
 */
export function useCalibration(deps: CalibrationDeps): CalibrationModel {
  return new Calibration(deps)
}
