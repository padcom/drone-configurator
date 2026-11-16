// The parameters of the Tune screen, with the range of each. The names and the ranges are ArduPilot's own (`@Param` and `@Range`
// in the source: libraries/AC_AttitudeControl/AC_AttitudeControl.cpp, AC_AttitudeControl_Multi.cpp, AC_PosControl.cpp and
// ArduCopter/Parameters.cpp), and the names are also the ones the arducopter that CI's SITL runs has (its group names are in the
// binary); nothing is invented. The backend has the same list (apps/backend/tuning.pi) and holds every tuning write to it: a name
// that is not there is refused, and so is a value that is negative or above the `max` here. A test (table.test.ts) reads that
// file and checks that the two agree.
//
// Only a name that the VEHICLE HAS is shown as a slider: a firmware that names a parameter another way (the position controller's
// gains were
// `PSC_POSXY_P` and `PSC_VELXY_P` before they became `PSC_NE_POS_P` and `PSC_NE_VEL_P`) has no such row, and the page says what
// it did not find.
// The step of a slider is the interface's own (how far a key press moves it), not ArduPilot's.

/**
 * The groups of the Tune screen, in the order of the page: the rate loop, then the others under "More groups", then the filters
 * (their own part of the screen).
 */
export type TuneGroup = 'rate' | 'attitude' | 'feel' | 'position' | 'knob' | 'hover' | 'autotune' | 'gyro' | 'notch'

/** What a parameter is: a number on a slider, one of ArduPilot's named choices, or a mask of named bits. */
export type TuneKind = 'slider' | 'choice' | 'bits'

/** One parameter of the Tune screen. */
export interface TuneParam {
  /** ArduPilot's name of it. */
  id: string
  /** The group of the page it is in. */
  group: TuneGroup
  /** A slider or a named choice. */
  kind: TuneKind
  /** The least of ArduPilot's `@Range` (a value below it is warned). */
  lo: number
  /** The greatest of ArduPilot's `@Range`: a value above it is refused here and in the backend. */
  hi: number
  /** How far a key press moves its slider (the interface's own step). */
  step: number
  /** The unit of its value, when ArduPilot gives one. */
  units?: string
  /**
   * Whether a change takes effect while the vehicle is armed. A parameter the firmware reads only when it starts
   * (`@RebootRequired` in its source, or what its start-up code allocates by) is written while disarmed only: refused while
   * armed, here and in the backend.
   */
  armedOk: boolean
}

/** A row of a group's table: the name, the least and the greatest of ArduPilot's range, the step of the slider, and the unit. */
type Row = readonly [id: string, lo: number, hi: number, step: number, units?: string]

/**
 * The sliders of a group.
 *
 * @param group the group
 * @param rows the rows of its table
 * @returns the parameters
 */
function sliders(group: TuneGroup, rows: readonly Row[]): TuneParam[] {
  return rows.map(([id, lo, hi, step, units]) => (
    units === undefined
      ? { id, group, kind: 'slider', lo, hi, step, armedOk: true }
      : { id, group, kind: 'slider', lo, hi, step, units, armedOk: true }
  ))
}

/** A row of the filters' table: the name, its kind, its range, the step, whether armed is fine, and its unit. */
type FilterRow = readonly [id: string, kind: TuneKind, lo: number, hi: number, step: number, armedOk: boolean, units?: string]

/**
 * The parameters of a filters group.
 *
 * @param group the group
 * @param rows the rows of its table
 * @returns the parameters
 */
function filters(group: TuneGroup, rows: readonly FilterRow[]): TuneParam[] {
  return rows.map(([id, kind, lo, hi, step, armedOk, units]) => (
    units === undefined ? { id, group, kind, lo, hi, step, armedOk } : { id, group, kind, lo, hi, step, units, armedOk }
  ))
}

/** The parameters, in the order of the page (the order of the backend's list too). */
export const TUNE_PARAMS: readonly TuneParam[] = [
  ...sliders('rate', [
    ['ATC_RAT_RLL_P', 0.01, 0.5, 0.005],
    ['ATC_RAT_RLL_I', 0.01, 2.0, 0.01],
    ['ATC_RAT_RLL_D', 0, 0.05, 0.001],
    ['ATC_RAT_RLL_FF', 0, 0.5, 0.001],
    ['ATC_RAT_PIT_P', 0.01, 0.5, 0.005],
    ['ATC_RAT_PIT_I', 0.01, 2.0, 0.01],
    ['ATC_RAT_PIT_D', 0, 0.05, 0.001],
    ['ATC_RAT_PIT_FF', 0, 0.5, 0.001],
    ['ATC_RAT_YAW_P', 0.1, 2.5, 0.005],
    ['ATC_RAT_YAW_I', 0.01, 1.0, 0.01],
    ['ATC_RAT_YAW_D', 0, 0.02, 0.001],
    ['ATC_RAT_YAW_FF', 0, 0.5, 0.001],
  ]),
  ...sliders('attitude', [['ATC_ANG_RLL_P', 3, 12, 0.01], ['ATC_ANG_PIT_P', 3, 12, 0.01], ['ATC_ANG_YAW_P', 3, 12, 0.01]]),
  ...sliders('feel', [
    ['ATC_INPUT_TC', 0, 1, 0.01, 's'],
    ['ATC_ACC_R_MAX', 0, 1800, 10, 'deg/s/s'],
    ['ATC_ACC_P_MAX', 0, 1800, 10, 'deg/s/s'],
    ['ATC_ACC_Y_MAX', 0, 720, 10, 'deg/s/s'],
    ['ATC_RATE_R_MAX', 0, 1080, 1, 'deg/s'],
    ['ATC_RATE_P_MAX', 0, 1080, 1, 'deg/s'],
    ['ATC_RATE_Y_MAX', 0, 1080, 1, 'deg/s'],
  ]),
  ...sliders('position', [
    ['PSC_NE_POS_P', 0.5, 4, 0.05],
    ['PSC_D_POS_P', 0.5, 4, 0.05],
    ['PSC_NE_VEL_P', 0.1, 10, 0.1],
    ['PSC_NE_VEL_I', 0.1, 10, 0.1],
    ['PSC_NE_VEL_D', 0, 1, 0.01],
    ['PSC_D_VEL_P', 1, 10, 0.1],
    ['PSC_D_ACC_P', 0.01, 0.25, 0.005],
    ['PSC_D_ACC_I', 0, 0.5, 0.01],
  ]),
  // The knob's function (ArduPilot's `@Values` of TUNE, 0 to 61): a named choice, not a slider. The knob's ends (TUNE_MIN and
  // TUNE_MAX, which ArduPilot gives no range) stay on the Parameters screen.
  { id: 'TUNE', group: 'knob', kind: 'choice', lo: 0, hi: 61, step: 1, armedOk: true },
  // The hover throttle and AutoTune (AP_MotorsMulticopter.cpp, AC_AutoTune_Multi.cpp), written in flight because AutoTune needs
  // them there; none is `@RebootRequired`. THST_HOVER is 0.125 to 0.6875; HOVER_LEARN is a named choice (0 to 2); AXES a mask of
  // four bits (0 to 15), set before AutoTune is engaged.
  ...filters('hover', [
    ['MOT_THST_HOVER', 'slider', 0.125, 0.6875, 0.005, true],
    ['MOT_HOVER_LEARN', 'choice', 0, 2, 1, true],
  ]),
  ...filters('autotune', [
    ['AUTOTUNE_AXES', 'bits', 0, 15, 1, true],
    ['AUTOTUNE_AGGR', 'slider', 0.05, 0.1, 0.005, true],
    ['AUTOTUNE_MIN_D', 'slider', 0.0001, 0.005, 0.0001, true],
    ['AUTOTUNE_GMBK', 'slider', 0, 0.5, 0.01, true],
  ]),
  // The filters (libraries/AP_InertialSensor/AP_InertialSensor.cpp and libraries/Filter/HarmonicNotchFilter.cpp of ArduPilot
  // master, 4.8.0-dev). The gyro filter, and the notch's centre, bandwidth and attenuation, take effect live: the notch is
  // rebuilt when they change. The others are read when the vehicle starts (ENABLE, MODE and OPTS decide what is built then;
  // HMNCS, REF and OPTS are `@RebootRequired`): written while disarmed only. The gyro filter's least is 10 here, not 0:
  // ArduPilot says of 0 "no filtering (not recommended!)", and 1 to 10 Hz leaves a vehicle that cannot be flown (ArduPilot's
  // guidance is 20 to 80 Hz): not written in the air.
  ...filters('gyro', [['INS_GYRO_FILTER', 'slider', 10, 256, 1, true, 'Hz']]),
  ...filters('notch', [
    ['INS_HNTCH_ENABLE', 'choice', 0, 1, 1, false],
    ['INS_HNTCH_MODE', 'choice', 0, 5, 1, false],
    ['INS_HNTCH_REF', 'slider', 0, 1, 0.01, false],
    ['INS_HNTCH_FREQ', 'slider', 10, 495, 1, true, 'Hz'],
    ['INS_HNTCH_BW', 'slider', 5, 250, 1, true, 'Hz'],
    ['INS_HNTCH_ATT', 'slider', 5, 50, 1, true, 'dB'],
    ['INS_HNTCH_HMNCS', 'bits', 0, 65535, 1, false],
    ['INS_HNTCH_OPTS', 'bits', 0, 127, 1, false],
  ]),
]

/**
 * The parameter of a name.
 *
 * @param id the name
 * @returns the parameter, or undefined when it is not one of the Tune screen's
 */
export function tuneParam(id: string): TuneParam | undefined {
  return TUNE_PARAMS.find(param => param.id === id)
}

/**
 * The parameters of a group, in the order of the page.
 *
 * @param group the group
 * @returns the parameters
 */
export function tuneGroup(group: TuneGroup): TuneParam[] {
  return TUNE_PARAMS.filter(param => param.group === group)
}

/**
 * How a value is refused: it is not a number, it is negative, it is above the most ArduPilot's table allows, it is below the
 * least it allows WHILE THE VEHICLE IS ARMED (disarmed that is only warned about: a gain of 0 is for the bench, not the air), or
 * the parameter is read only when the vehicle starts and the vehicle is armed (`reboot`).
 */
export type TuneRefusal = 'nan' | 'negative' | 'above' | 'below' | 'reboot' | null

/**
 * What the armed state refuses of a value that is within the greatest: the least of the range is a limit then, and so is a
 * parameter that the vehicle reads only when it starts.
 *
 * @param value the value
 * @param param the parameter
 * @param armed whether the vehicle is armed
 * @returns why it is refused, or null (always null while disarmed)
 */
function whileArmed(value: number, param: TuneParam, armed: boolean): TuneRefusal {
  if (!armed) {
    return null
  }

  return value < param.lo ? 'below' : (param.armedOk ? null : 'reboot')
}

/**
 * Whether a number is beyond the limits of a parameter.
 *
 * @param value the value
 * @param param the parameter
 * @param armed whether the vehicle is armed (then the least of the table is a limit too)
 * @returns why it is refused, or null
 */
function beyond(value: number, param: TuneParam, armed: boolean): TuneRefusal {
  if (value < 0) {
    return 'negative'
  }
  if (value > param.hi) {
    return 'above'
  }

  return whileArmed(value, param, armed)
}

/**
 * Whether a value is one the Tune screen refuses to write, whatever the vehicle or the metadata says. The same rule is in the
 * backend, which is the one that holds.
 *
 * @param id the parameter
 * @param value the value
 * @param armed whether the vehicle is armed: a value below the least of the table is refused then, else only warned about
 * @returns why it is refused, or null (an unknown name is refused too: it is `nan`, nothing of the Tune screen)
 */
export function refusalOf(id: string, value: number, armed = false): TuneRefusal {
  const param = tuneParam(id)

  return Number.isFinite(value) && param !== undefined ? beyond(value, param, armed) : 'nan'
}

/**
 * The range of a parameter as a definition file gives it (the metadata of a vehicle), for a warning when a value is outside it.
 *
 * @param param the parameter
 * @returns its range and unit, in the shape the metadata has
 */
export function tableMeta(param: TuneParam): { min: number, max: number, units?: string } {
  return param.units === undefined ? { min: param.lo, max: param.hi } : { min: param.lo, max: param.hi, units: param.units }
}

/**
 * What the radio knob can tune (`TUNE`): ArduPilot's own `@Values` of the parameter in ArduCopter/Parameters.cpp, with its names
 * (the vehicle's vocabulary, the same in every language). A firmware that does not have one of them refuses it (the read-back
 * says so).
 */
export const TUNE_FUNCTIONS: { value: number, label: string }[] = [
  [0, 'None'],
  [1, 'Stab Roll/Pitch kP'],
  [4, 'Rate Roll/Pitch kP'],
  [5, 'Rate Roll/Pitch kI'],
  [21, 'Rate Roll/Pitch kD'],
  [3, 'Stab Yaw kP'],
  [6, 'Rate Yaw kP'],
  [26, 'Rate Yaw kD'],
  [56, 'Rate Yaw Filter'],
  [55, 'Motor Yaw Headroom'],
  [14, 'AltHold kP'],
  [7, 'Throttle Rate kP'],
  [34, 'Throttle Accel kP'],
  [35, 'Throttle Accel kI'],
  [36, 'Throttle Accel kD'],
  [12, 'Loiter Pos kP'],
  [22, 'Velocity XY kP'],
  [28, 'Velocity XY kI'],
  [10, 'WP Speed (4.6 and earlier)'],
  [25, 'Acro Roll/Pitch deg/s'],
  [40, 'Acro Yaw deg/s'],
  [45, 'RC Feel'],
  [38, 'Declination'],
  [39, 'Circle Rate'],
  [46, 'Rate Pitch kP'],
  [47, 'Rate Pitch kI'],
  [48, 'Rate Pitch kD'],
  [49, 'Rate Roll kP'],
  [50, 'Rate Roll kI'],
  [51, 'Rate Roll kD'],
  [52, 'Rate Pitch FF'],
  [53, 'Rate Roll FF'],
  [54, 'Rate Yaw FF'],
  [58, 'SysID Magnitude'],
  [59, 'PSC Angle Max'],
  [60, 'Loiter Speed'],
  [61, 'WP Speed (m/s)'],
].map(([value, label]) => ({ value: value as number, label: label as string }))

/** The roll, pitch and yaw rows of the rate group: which axes there are, and the term of each row. */
export const RATE_TERMS = ['P', 'I', 'D', 'FF'] as const

/** The axes of the rate group, and the pair that can be linked. */
export const RATE_AXES = ['RLL', 'PIT', 'YAW'] as const

/** The name of a rate parameter. */
export type Axis = typeof RATE_AXES[number]

export type Term = typeof RATE_TERMS[number]

/**
 * The name of a rate parameter.
 *
 * @param axis the axis
 * @param term the term
 * @returns for example `ATC_RAT_RLL_P`
 */
export function rateId(axis: Axis, term: Term): string {
  return `ATC_RAT_${axis}_${term}`
}

/**
 * The other axis of a linked pair: what a change of roll's term also changes, and the other way round.
 *
 * @param axis the axis
 * @returns pitch for roll, roll for pitch, null for yaw (it is never linked)
 */
export function partnerOf(axis: Axis): Axis | null {
  if (axis === 'YAW') {
    return null
  }

  return axis === 'RLL' ? 'PIT' : 'RLL'
}
