// The Setup home's steps, worked out from the vehicle's parameters. ArduPilot has no "calibrated" flag over MAVLink, so every
// step is a HEURISTIC and says what it looked at ("COMPASS_OFS are all zero"): a step is `done` when its parameters are not at
// the values a vehicle that was never set up has, `open` when they are, and `unknown` when it cannot be told from parameters (the
// motors, whose test has not been run from here). Nothing here says a calibration is valid, and no card says "verified". A step
// whose parameters are not on the vehicle is `unknown`, never `open` or `done`.
import { ESCAPE_MODES, SLOT_PARAMS } from './flightModes'

/** The steps of a Copter, in the order of the home page (the design's get-flying group). */
export type StepId = 'frame' | 'accel' | 'compass' | 'radio' | 'motors' | 'modes' | 'failsafes' | 'battery'

/** How a step stands: set up as far as the parameters say, still at the defaults of a vehicle never set up, or not to be told. */
export type StepState = 'done' | 'open' | 'unknown'

/** A message of the interface with what fills it: the words are `key`, in every language. */
export interface Fact {
  /** The message of the interface: its words are `key`, in every language. */
  key: string
  /** What fills the message. */
  params?: Record<string, string | number>
}

/** One step: its state, what it shows as its value, and what was checked to say so. */
export interface Step {
  /** Which step. */
  id: StepId
  /** How it stands. */
  state: StepState
  /** Its value. */
  value: Fact
  /** What was looked at to say so. */
  checked: Fact
}

/** The steps, how many of them could be told, how many of those are done, and the first one that is not. */
export interface Status {
  /** The steps, in the order of the home page. */
  steps: Step[]
  /** How many of the steps could be told from the parameters. */
  required: number
  /** How many of those look set up. */
  done: number
  /** The first step that is open, or null. */
  next: Step | null
}

/** The parameters of the vehicle, by name. */
export type Values = ReadonlyMap<string, number>

/** The words of a step that is open at the defaults and done otherwise. */
interface Words {
  /** The message of the value when the step is open. */
  open: string
  /** The message of the value when it is done. */
  done: string
  /** The message of what was checked. */
  checked: string
}

/**
 * The values of some parameters, or null when any is not on the vehicle.
 *
 * @param values the parameters
 * @param ids their names
 * @returns the values in the order of the names, or null
 */
function all(values: Values, ids: readonly string[]): number[] | null {
  const found = ids.map(id => values.get(id))

  return found.every(value => value !== undefined) ? found as number[] : null
}

/**
 * One of the values `all` found.
 *
 * @param found the values
 * @param index which
 * @returns the value (0 past the end, which `all` never gives)
 */
function at(found: readonly number[], index: number): number {
  return found[index] ?? 0
}

/**
 * A step that cannot be told.
 *
 * @param id the step
 * @param checked what it would have looked at
 * @returns the step
 */
function unknown(id: StepId, checked: Fact = { key: 'setup.status.notOnVehicle' }): Step {
  return { id, state: 'unknown', value: { key: 'setup.status.unknown' }, checked }
}

/**
 * A step that is open while its parameters are at the defaults, and done when they are not.
 *
 * @param id the step
 * @param atDefault whether they are at the defaults
 * @param words the words
 * @returns the step
 */
function byDefaults(id: StepId, atDefault: boolean, words: Words): Step {
  const checked = { key: words.checked }

  return atDefault
    ? { id, state: 'open', value: { key: words.open }, checked }
    : { id, state: 'done', value: { key: words.done }, checked }
}

/**
 * Whether every one of some values is a value.
 *
 * @param found the values
 * @param value the value
 * @returns true if all are
 */
function allAt(found: readonly number[], value: number): boolean {
  return found.every(one => one === value)
}

/**
 * A step that is done, with its value in words.
 *
 * @param id the step
 * @param value the value
 * @param checked what was checked
 * @returns the step
 */
function done(id: StepId, value: Fact, checked: string): Step {
  return { id, state: 'done', value, checked: { key: checked } }
}

/**
 * A step that is open, with its value in words.
 *
 * @param id the step
 * @param value the message of the value
 * @param checked what was checked
 * @returns the step
 */
function open(id: StepId, value: string, checked: string): Step {
  return { id, state: 'open', value: { key: value }, checked: { key: checked } }
}

/**
 * The frame: set when FRAME_CLASS is not 0 (undefined).
 *
 * @param values the parameters
 * @returns the step
 */
function frame(values: Values): Step {
  const found = all(values, ['FRAME_CLASS', 'FRAME_TYPE'])
  const checked = 'setup.status.frame.checked'
  if (!found) {
    return unknown('frame')
  }
  const value = { key: 'setup.status.frame.value', params: { frameClass: at(found, 0), frameType: at(found, 1) } }

  return at(found, 0) === 0 ? open('frame', 'setup.status.frame.none', checked) : done('frame', value, checked)
}

/**
 * The accelerometer: its offsets and scales are not all at zero and one.
 *
 * @param values the parameters
 * @returns the step
 */
function accel(values: Values): Step {
  const offsets = all(values, ['INS_ACCOFFS_X', 'INS_ACCOFFS_Y', 'INS_ACCOFFS_Z'])
  const scales = all(values, ['INS_ACCSCAL_X', 'INS_ACCSCAL_Y', 'INS_ACCSCAL_Z'])
  if (!offsets || !scales) {
    return unknown('accel')
  }
  const words = { open: 'setup.status.accel.open', done: 'setup.status.accel.done', checked: 'setup.status.accel.checked' }

  return byDefaults('accel', allAt(offsets, 0) && allAt(scales, 1), words)
}

/**
 * The compass: its offsets are not all zero.
 *
 * @param values the parameters
 * @returns the step
 */
function compass(values: Values): Step {
  const offsets = all(values, ['COMPASS_OFS_X', 'COMPASS_OFS_Y', 'COMPASS_OFS_Z'])
  const words = { open: 'setup.status.compass.open', done: 'setup.status.compass.done', checked: 'setup.status.compass.checked' }

  return offsets ? byDefaults('compass', allAt(offsets, 0), words) : unknown('compass')
}

/** The default range of a radio channel (RCn_MIN, RCn_MAX): a vehicle whose radio was calibrated has others. */
const RC_DEFAULT_MIN = 1100
const RC_DEFAULT_MAX = 1900

/**
 * The radio: the range of the first four channels is not the default one.
 *
 * @param values the parameters
 * @returns the step
 */
function radio(values: Values): Step {
  const mins = all(values, ['RC1_MIN', 'RC2_MIN', 'RC3_MIN', 'RC4_MIN'])
  const maxs = all(values, ['RC1_MAX', 'RC2_MAX', 'RC3_MAX', 'RC4_MAX'])
  if (!mins || !maxs) {
    return unknown('radio')
  }
  const words = { open: 'setup.status.radio.open', done: 'setup.status.radio.done', checked: 'setup.status.radio.checked' }

  return byDefaults('radio', allAt(mins, RC_DEFAULT_MIN) && allAt(maxs, RC_DEFAULT_MAX), words)
}

/**
 * The flight modes: the six slots are set, and at least one brings the vehicle home or down.
 *
 * @param values the parameters
 * @returns the step
 */
function modes(values: Values): Step {
  const slots = all(values, SLOT_PARAMS)
  const channel = values.get('FLTMODE_CH')
  const checked = 'setup.status.modes.checked'
  if (!slots || channel === undefined) {
    return unknown('modes')
  }

  return slots.some(mode => ESCAPE_MODES.includes(mode))
    ? done('modes', { key: 'setup.status.modes.value', params: { channel } }, checked)
    : open('modes', 'setup.status.modes.noEscape', checked)
}

/**
 * The failsafes: the radio failsafe is on (it is the one a lost transmitter needs), and the others are counted.
 *
 * @param values the parameters
 * @returns the step
 */
function failsafes(values: Values): Step {
  const found = all(values, ['FS_THR_ENABLE', 'FS_GCS_ENABLE', 'FS_EKF_ACTION', 'BATT_FS_LOW_ACT'])
  const checked = 'setup.status.failsafes.checked'
  if (!found) {
    return unknown('failsafes')
  }
  const value = { key: 'setup.status.failsafes.value', params: { on: found.filter(one => one !== 0).length } }

  return at(found, 0) === 0 ? open('failsafes', 'setup.status.failsafes.radioOff', checked) : done('failsafes', value, checked)
}

/**
 * The battery: a monitor is chosen and a capacity is given.
 *
 * @param values the parameters
 * @returns the step
 */
function batteryStep(values: Values): Step {
  const found = all(values, ['BATT_MONITOR', 'BATT_CAPACITY'])
  const checked = 'setup.status.battery.checked'
  if (!found) {
    return unknown('battery')
  }
  const value = { key: 'setup.status.battery.value', params: { capacity: at(found, 1) } }

  const set = at(found, 0) > 0 && at(found, 1) > 0

  return set ? done('battery', value, checked) : open('battery', 'setup.status.battery.open', checked)
}

/**
 * The motors cannot be told from parameters: the motor test is not run from here yet.
 *
 * @returns the step
 */
function motors(): Step {
  return unknown('motors', { key: 'setup.status.motors.checked' })
}

/**
 * The steps of a Copter's setup, from its parameters.
 *
 * @param values the parameters by name
 * @returns the steps, how many could be told and are done, and the first one that is open
 */
export function setupStatus(values: Values): Status {
  const steps = [
    frame(values),
    accel(values),
    compass(values),
    radio(values),
    motors(),
    modes(values),
    failsafes(values),
    batteryStep(values),
  ]
  const told = steps.filter(step => step.state !== 'unknown')

  return {
    steps,
    required: told.length,
    done: told.filter(step => step.state === 'done').length,
    next: steps.find(step => step.state === 'open') ?? null,
  }
}
