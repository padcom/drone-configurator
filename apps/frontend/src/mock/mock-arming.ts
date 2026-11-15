// The mock's arming service (`vehicle.arm`, `vehicle.disarm`, `vehicle.setMode`, `vehicle.prearm`), as the backend does it: the
// refusals before anything is sent (not connected, state unknown, armed or not, busy, a mode the kind has not), each command
// sent ONCE, and the vehicle's own words (a STATUSTEXT "PreArm: ...") for a refusal. The answer, the pre-arm texts and what was
// sent are set and read by a test (`MockArmingControl`). What the vehicle IS afterwards is what the telemetry says: an arm that
// was accepted makes the vehicle armed (its next sample says so), and so does one nothing answered (it may have been done).
import type { Envelope } from '@pico-desktop/protocol'
import type { ArmingResult, SetModeAsk, TakeoffAsk } from '@/generated/app'
import { COPTER_MODES } from './fixtures'

type Ok = (p: Envelope['p']) => void
type Fail = (code: string, message: string) => void

/** What a test sets and reads. */
export interface MockArmingControl {
  /** The pre-arm texts the vehicle says when asked to arm (and refuses with), or when the checks are run: none by default. */
  prearm?: (texts: string[]) => void
  /** What the vehicle answers to the next commands (`accepted` unless set). */
  answer?: (answer: ArmingResult['result']) => void
  /** What the vehicle was sent, in order: `arm`, `disarm`, `mode N`, `prearm` (a refusal of the backend sent nothing). */
  sent?: () => string[]
  /** The mode the vehicle is in (its name), when a mode change was accepted; undefined until then. */
  mode?: () => string | undefined
}

/** What the mock needs of the vehicle it belongs to. */
export interface ArmingHost {
  /** Whether a vehicle is connected. */
  connected: () => boolean
  /** Whether the vehicle is armed: undefined or null when it is not known. */
  armed: () => boolean | null | undefined
  /** Whether a parameter write or download is under way. */
  busy: () => boolean
  /** Makes the vehicle armed or disarmed (what its next telemetry says). */
  setArmed: (armed: boolean) => void
  /** The vehicle says something (a STATUSTEXT). */
  say: (severity: number, text: string) => void
  /** The messages the vehicle has said, last last. */
  heard: () => { id: number, text: string }[]
}

/** MAV_RESULT FAILED, and MAV_SEVERITY ERROR. */
const FAILED = 4
const ERROR = 3

/** A refusal of the backend: its code and words. */
type Refusal = [code: string, message: string]

/** The answers of a vehicle that carried the command out (an answer that never came may be one of them). */
const CARRIED_OUT: readonly ArmingResult['result'][] = ['accepted', 'no-answer']

/** The modes the backend allows in a state that is not known. */
const SAFETY_MODES: readonly string[] = ['RTL', 'LAND']

/**
 * The refusal of a command that needs the vehicle armed or disarmed, when it is not.
 *
 * @param armed the vehicle's state
 * @param needsArmed true for a command that needs an armed vehicle, false for one that needs a disarmed one, null for none
 * @returns the refusal, or null
 */
function mismatch(armed: boolean, needsArmed: boolean | null): Refusal | null {
  if (needsArmed === null || needsArmed === armed) {
    return null
  }

  return needsArmed ? ['NOT_ARMED', 'the vehicle is not armed'] : ['ARMED', 'the vehicle is armed']
}

/**
 * Why a command needing `needsArmed` may not go with a vehicle in this state, or null.
 *
 * @param armed the vehicle's state: undefined or null when it is not known
 * @param needsArmed true for a command that needs an armed vehicle, false for one that needs a disarmed one, null for none
 * @returns the refusal, or null
 */
function stateRefusal(armed: boolean | null | undefined, needsArmed: boolean | null): Refusal | null {
  if (armed === undefined || armed === null) {
    return ['STATE_UNKNOWN', 'the vehicle\'s state is unknown (no heartbeat for 3 s)']
  }

  return mismatch(armed, needsArmed)
}

/**
 * The words and the code of an answer.
 *
 * @param result the answer
 * @returns what goes with it
 */
function detailOf(result: ArmingResult['result']): Pick<ArmingResult, 'code' | 'detail'> {
  if (result === 'refused') {
    return { code: FAILED, detail: 'the vehicle refused' }
  }

  return result === 'no-answer' ? { detail: 'no answer: the command may have been carried out; it is not sent again' } : {}
}

/**
 * Whether a refusal because the state is not known does not apply: the mode is one of the safety actions.
 *
 * @param refusal the refusal of the state
 * @param name the mode's name
 * @returns true when the change goes on all the same
 */
function allowedUnknown(refusal: Refusal | null, name: string): boolean {
  return refusal !== null && refusal[0] === 'STATE_UNKNOWN' && SAFETY_MODES.includes(name)
}

/** The service. */
export class MockArming {
  private texts: string[] = []

  private answer: ArmingResult['result'] = 'accepted'

  private readonly sentList: string[] = []

  private modeName: string | undefined

  /**
   * Makes the service.
   *
   * @param host the vehicle it belongs to
   */
  constructor(private readonly host: ArmingHost) {}

  /**
   * The controls a test has.
   *
   * @returns the controls
   */
  control(): MockArmingControl {
    return {
      prearm: texts => {
        this.texts = [...texts]
      },
      answer: answer => {
        this.answer = answer
      },
      sent: () => [...this.sentList],
      mode: () => this.modeName,
    }
  }

  /**
   * The vehicle's mode, when a change was accepted (the telemetry says it).
   *
   * @returns the mode's name, or undefined
   */
  mode(): string | undefined {
    return this.modeName
  }

  /** A session starts over: the mode the vehicle was in is forgotten. */
  reset(): void {
    this.modeName = undefined
  }

  /**
   * The refusal the backend makes before it sends a command, or null.
   *
   * @param needsArmed true for a command that needs an armed vehicle, false for one that needs a disarmed one, null for none
   * @returns the refusal
   */
  private refusal(needsArmed: boolean | null): Refusal | null {
    if (!this.host.connected()) {
      return ['NOT_CONNECTED', 'no vehicle is connected']
    }

    return stateRefusal(this.host.armed(), needsArmed)
  }

  /**
   * The id the next message the vehicle says will have.
   *
   * @returns the id
   */
  private nextId(): number {
    return (this.host.heard().at(-1)?.id ?? 0) + 1
  }

  /**
   * What the vehicle said from a message on.
   *
   * @param from the id of the first message to include
   * @returns the texts
   */
  private said(from: number): string[] {
    return this.host.heard().filter(message => message.id >= from).map(message => message.text)
  }

  /** The vehicle prints its pre-arm texts. */
  private printPrearm(): void {
    this.texts.forEach(text => this.host.say(ERROR, `PreArm: ${text}`))
  }

  /**
   * What the vehicle answers to a command it was sent, and does when it carried it out (also when it answers nothing).
   *
   * @param refuses whether the vehicle refuses it
   * @param apply what the vehicle does when it carries the command out
   * @returns the answer, with the texts the vehicle said meanwhile
   */
  private answerOf(refuses: boolean, apply: () => void): ArmingResult {
    const from = this.nextId()
    if (refuses) {
      this.printPrearm()
    }
    const result = refuses ? 'refused' : this.answer
    if (CARRIED_OUT.includes(result)) {
      apply()
    }

    return { result, messages: this.said(from), ...detailOf(result) }
  }

  /**
   * Sends a command once: records it, and answers.
   *
   * @param what what was sent
   * @param ok answers
   * @param apply what the vehicle does when it carries the command out
   * @param refuses whether the vehicle refuses it
   */
  private send(what: string, ok: Ok, apply: () => void, refuses = false): void {
    this.sentList.push(what)
    ok(this.answerOf(refuses, apply))
  }

  /**
   * The backend's `vehicle.arm`.
   *
   * @param ok answers
   * @param fail answers an error
   */
  arm(ok: Ok, fail: Fail): void {
    const refusal = this.refusal(false)
    if (refusal !== null) {
      fail(...refusal)
    } else if (this.host.busy()) {
      fail('BUSY', 'an earlier command, a parameter or log operation, a calibration, a motor test or a reboot is under way')
    } else {
      this.send('arm', ok, () => this.host.setArmed(true), this.texts.length > 0)
    }
  }

  /**
   * The backend's `vehicle.disarm`.
   *
   * @param ok answers
   * @param fail answers an error
   */
  disarm(ok: Ok, fail: Fail): void {
    const refusal = this.refusal(true)
    if (refusal === null) {
      this.send('disarm', ok, () => this.host.setArmed(false))
    } else {
      fail(...refusal)
    }
  }

  /**
   * The backend's `vehicle.emergencyStop`: refused only without a connection; whatever the state, it is sent, and a vehicle that
   * answers (or may have) is disarmed.
   *
   * @param ok answers
   * @param fail answers an error
   */
  emergencyStop(ok: Ok, fail: Fail): void {
    if (this.host.connected()) {
      this.send('stop', ok, () => this.host.setArmed(false))
    } else {
      fail('NOT_CONNECTED', 'no vehicle is connected')
    }
  }

  /**
   * The backend's `vehicle.takeoff`: an armed vehicle whose state is known, an altitude of 2 to 120 m; the vehicle takes it (the
   * mock does not climb).
   *
   * @param ask the altitude
   * @param ok answers
   * @param fail answers an error
   */
  takeoff(ask: TakeoffAsk, ok: Ok, fail: Fail): void {
    const refusal = this.refusal(true) ?? this.takeoffRefusal(ask.altitude)
    if (refusal === null) {
      this.send(`takeoff ${ask.altitude}`, ok, () => undefined)
    } else {
      fail(...refusal)
    }
  }

  /**
   * What stops a takeoff to an altitude, besides the state of the vehicle.
   *
   * @param altitude metres above home
   * @returns the refusal, or null
   */
  private takeoffRefusal(altitude: number): Refusal | null {
    if (!(altitude >= 2) || altitude > 120) {
      return ['INVALID_VALUE', 'a takeoff altitude is 2 to 120 m above home']
    }

    return this.host.busy() ? ['BUSY', 'an earlier command, a parameter or log operation or a reboot is under way'] : null
  }

  /**
   * The pre-arm checks as the vehicle's telemetry says them: they pass when no text is set, or the vehicle is armed (it says so).
   *
   * @param armed whether the vehicle is armed
   * @returns the group
   */
  prearmGroup(armed: boolean): { enabled: boolean, passing: boolean, ageMs: number } {
    return { enabled: true, passing: armed || this.texts.length === 0, ageMs: 200 }
  }

  /**
   * The backend's `vehicle.prearm`: the vehicle runs its checks and says what fails.
   *
   * @param ok answers
   * @param fail answers an error
   */
  prearm(ok: Ok, fail: Fail): void {
    const refusal = this.refusal(false)
    if (refusal !== null) {
      fail(...refusal)

      return
    }
    this.sentList.push('prearm')
    const from = this.nextId()
    this.printPrearm()
    ok({ result: 'accepted', messages: this.said(from) } satisfies ArmingResult)
  }

  /**
   * The refusal of a change to a mode, or null: a mode of the kind, and a state that is known (RTL and LAND need only a link).
   *
   * @param name the mode's name, undefined when the kind has no such number
   * @param number the number asked for
   * @returns the refusal
   */
  private modeRefusal(name: string | undefined, number: number): Refusal | null {
    const refusal = this.refusal(null)
    if (!this.host.connected()) {
      return refusal
    }
    if (name === undefined) {
      return ['INVALID_VALUE', `mode ${number} is not one of this vehicle's modes`]
    }

    return allowedUnknown(refusal, name) ? null : refusal
  }

  /**
   * The backend's `vehicle.setMode`.
   *
   * @param ask the mode
   * @param ok answers
   * @param fail answers an error
   */
  setMode(ask: SetModeAsk, ok: Ok, fail: Fail): void {
    const name = COPTER_MODES.find(mode => mode.number === ask.mode)?.name
    const refusal = this.modeRefusal(name, ask.mode)
    if (refusal === null) {
      this.send(`mode ${ask.mode}`, ok, () => {
        this.modeName = name
      })
    } else {
      fail(...refusal)
    }
  }
}
