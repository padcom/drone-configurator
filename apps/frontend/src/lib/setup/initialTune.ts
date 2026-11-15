// The "Initial tune" values: what Mission Planner's Config > Initial Parameter Setup calculates for a multicopter of a given
// propeller size and battery. The formulas are Mission Planner's own: GCSViews/ConfigurationView/ConfigInitialParams.cs
// (`calc_values`, lines 89-121; the battery types 251-275; the parameters written 153-209), as read from its source on
// 2026-11-15. Each constant below names the line it is from. There is a note of them all, with the differences from ArduPilot's
// web page, in workspaces/developer/mission-planner-initial-tune.md (not in this repository: it is quoted in the pull request).
//
// What is NOT taken from Mission Planner: its optional "T-Motor" box (MOT_THST_EXPO 0.2, MOT_PWM_MIN/MAX), its "Suggested"
// box (battery failsafe actions and a fence), the ArduPlane (Q_) names and the 3.x names (*_FILT). The values are suggestions:
// they go to the staged review of the Setup page, and only for a parameter the vehicle has.

/** The most cells accepted (a 12S pack): Mission Planner names none, this is the interface's own bound. */
export const MAX_CELLS = 12

/** The greatest propeller size accepted, in inches: Mission Planner takes any size above 0, this is the interface's own bound. */
export const MAX_SIZE = 60

/** The least propeller size accepted, in inches (the interface's own bound). */
export const MIN_SIZE = 1

/** A kind of battery: the voltage of one cell full and empty (ConfigInitialParams.cs:257-269). */
export interface Chemistry {
  /** Its name, as Mission Planner shows it. */
  id: 'LiPo' | 'LiPoHV' | 'LiIon'
  /** Volts of a full cell. */
  cellMax: number
  /** Volts of an empty cell. */
  cellMin: number
}

/** The kinds of battery, the first being the default (ConfigInitialParams.cs:66, 258-269). */
export const CHEMISTRIES: readonly Chemistry[] = [
  { id: 'LiPo', cellMax: 4.2, cellMin: 3.3 },
  { id: 'LiPoHV', cellMax: 4.35, cellMin: 3.3 },
  { id: 'LiIon', cellMax: 4.1, cellMin: 2.8 },
]

/** Why a parameter has no value to offer: the size or the cells are not known yet. */
export type NoValue = 'size' | 'cells'

/** One parameter of the initial tune. */
export interface Suggestion {
  /** The parameter's name (the current one: *_FLTD, *_FLTT, *_FLTE). */
  id: string
  /** The value, or null when there is none to offer. */
  value: number | null
  /** Why there is none. */
  why: NoValue | null
}

/** What the user says. */
export interface TuneInput {
  /** The propeller size in inches, or null when it is not known. */
  size: number | null
  /** The cells, or null when they are not known. */
  cells: number | null
  /** The kind of battery. */
  chemistry: Chemistry
}

/**
 * The number of cells in a text.
 *
 * @param text what the user typed
 * @returns a whole number from 1 to MAX_CELLS, or null
 */
export function parseCells(text: string): number | null {
  const digits = text.trim()
  const cells = Number(digits)

  // (plain digits: not "1e1", not "0x4", not "4.0")
  return /^\d{1,2}$/u.test(digits) && cells >= 1 && cells <= MAX_CELLS ? cells : null
}

/**
 * The propeller size in a text.
 *
 * @param text what the user typed
 * @returns inches from MIN_SIZE to MAX_SIZE (one decimal at most), or null
 */
export function parseSize(text: string): number | null {
  const digits = text.trim()
  const size = Number(digits)

  // (plain digits, a point and one decimal: not "1e1", not "0x9", not a comma)
  return /^\d{1,2}(?:\.\d)?$/u.test(digits) && size >= MIN_SIZE && size <= MAX_SIZE ? size : null
}

/**
 * A number to some decimals (4.2 x 3 is not 12.600000000000001).
 *
 * @param value the number
 * @param decimals how many decimals
 * @returns the number, rounded
 */
function rounded(value: number, decimals: number): number {
  const scale = 10 ** decimals

  return Math.round(value * scale) / scale
}

/**
 * Rounds to the nearest hundred, half up (ConfigInitialParams.cs `RoundTo(value, -2)`, lines 74-86).
 *
 * @param value the number
 * @returns the number, to hundreds
 */
function toHundreds(value: number): number {
  return Math.floor((value + 50) / 100) * 100
}

/**
 * A suggestion.
 *
 * @param id the parameter
 * @param value the value, or null for none
 * @param why why there is none (when `value` is null)
 * @returns the suggestion
 */
function suggestion(id: string, value: number | null, why: NoValue): Suggestion {
  return { id, value, why: value === null ? why : null }
}

/**
 * What depends on the size of the propellers only (ConfigInitialParams.cs:91-113).
 *
 * @param size the propeller size, in inches
 * @returns the values, `accelYaw` and `accelPitchRoll` in centi-degrees/s/s as Mission Planner computes them
 */
function bySize(size: number): Record<string, number> {
  // :91 and :93
  const accelYaw = Math.max(8000, toHundreds(-900 * size + 36000))
  // :95
  const polynomial = -2.613267 * size ** 3 + 343.39216 * size ** 2 - 15_083.7121 * size + 235_771
  const accelPitchRoll = Math.max(10_000, toHundreds(polynomial))
  // :98
  const gyroFilter = Math.max(20, Math.round(289.22 * size ** -0.838))
  // :100-108: one half of the gyro filter, at least 10
  const half = Math.max(10, gyroFilter / 2)

  return {
    accelYaw,
    accelPitchRoll,
    gyroFilter,
    half,
    // :93
    acroYaw: rounded(0.5 * accelYaw / 4500, 4),
    // :112
    expo: Math.min(rounded(0.15686 * Math.log(size) + 0.23693, 2), 0.8),
  }
}

/**
 * The parameters that depend on the size.
 *
 * @param size the propeller size, or null
 * @returns the suggestions
 */
function sizeRows(size: number | null): Suggestion[] {
  const v = size === null ? null : bySize(size)
  const of = (key: string, scale = 1): number | null => v === null ? null : rounded((v[key] ?? 0) / scale, 4)
  const row = (id: string, value: number | null): Suggestion => suggestion(id, value, 'size')

  return [
    row('INS_ACCEL_FILTER', 10), // :111
    row('INS_GYRO_FILTER', of('gyroFilter')),
    row('ACRO_YAW_P', of('acroYaw')),
    // :167-169 and :173-175: the centi-degree ATC_ACCEL_*_MAX when the vehicle has it, else ATC_ACC_*_MAX / 100
    row('ATC_ACC_P_MAX', of('accelPitchRoll', 100)),
    row('ATC_ACC_R_MAX', of('accelPitchRoll', 100)),
    row('ATC_ACC_Y_MAX', of('accelYaw', 100)),
    row('ATC_ACCEL_P_MAX', of('accelPitchRoll')),
    row('ATC_ACCEL_R_MAX', of('accelPitchRoll')),
    row('ATC_ACCEL_Y_MAX', of('accelYaw')),
    // :100-108
    row('ATC_RAT_RLL_FLTD', of('half')),
    row('ATC_RAT_RLL_FLTE', 0),
    row('ATC_RAT_RLL_FLTT', of('half')),
    row('ATC_RAT_PIT_FLTD', of('half')),
    row('ATC_RAT_PIT_FLTE', 0),
    row('ATC_RAT_PIT_FLTT', of('half')),
    row('ATC_RAT_YAW_FLTD', 0),
    row('ATC_RAT_YAW_FLTE', 2),
    row('ATC_RAT_YAW_FLTT', of('half')),
    row('ATC_THR_MIX_MAN', 0.1), // :110 (and MOT_THST_HOVER :113)
    row('MOT_THST_EXPO', of('expo')),
    row('MOT_THST_HOVER', 0.2),
  ]
}

/**
 * The battery parameters (ConfigInitialParams.cs:115-119).
 *
 * @param cells the cells, or null
 * @param chemistry the kind of battery
 * @returns the suggestions
 */
function batteryRows(cells: number | null, chemistry: Chemistry): Suggestion[] {
  const volts = (value: (n: number) => number): number | null => cells === null ? null : rounded(value(cells), 2)
  const row = (id: string, value: number | null): Suggestion => suggestion(id, value, 'cells')

  return [
    // :115, :116, :117
    row('BATT_ARM_VOLT', volts(n => (n - 1) * 0.1 + (chemistry.cellMin + 0.3) * n)),
    row('BATT_CRT_VOLT', volts(n => (chemistry.cellMin + 0.2) * n)),
    row('BATT_LOW_VOLT', volts(n => (chemistry.cellMin + 0.3) * n)),
    // :118, :119
    row('MOT_BAT_VOLT_MAX', volts(n => chemistry.cellMax * n)),
    row('MOT_BAT_VOLT_MIN', volts(n => chemistry.cellMin * n)),
  ]
}

/**
 * The initial tune of a size and a battery.
 *
 * @param input the size, the cells and the kind of battery
 * @returns the parameters, each with its value or why it has none
 */
export function initialTune(input: TuneInput): Suggestion[] {
  return [...sizeRows(input.size), ...batteryRows(input.cells, input.chemistry)]
}

/**
 * The greatest value an acceleration limit may have in ArduPilot's own range (deg/s/s, `@Range` of ATC_ACC_*_MAX in the 4.7.2
 * tree and in master). The older parameter of the same thing, in centi-degrees, is named ATC_ACCEL_*_MAX: a vehicle that has the
 * name used here and a value above this has a value in another unit, and a suggestion in deg/s/s must not be written over it.
 */
const ACCEL_RANGE_MAX: Record<string, number> = { ATC_ACC_P_MAX: 1800, ATC_ACC_R_MAX: 1800, ATC_ACC_Y_MAX: 720 }

/**
 * Whether the vehicle's value of a parameter is beyond the range the suggested value is in.
 *
 * @param id the parameter
 * @param now the vehicle's value, or null when it has none
 * @returns true for an acceleration limit above its range
 */
export function beyondRange(id: string, now: number | null): boolean {
  const max = ACCEL_RANGE_MAX[id]

  return max !== undefined && now !== null && now > max
}

/** The acceleration limits in centi-degrees/s/s (the older parameters): only a vehicle that has ATC_ACCEL_P_MAX is given them. */
export const CENTI_DEGREE_IDS: readonly string[] = ['ATC_ACCEL_P_MAX', 'ATC_ACCEL_R_MAX', 'ATC_ACCEL_Y_MAX']

/** The acceleration limits in degrees/s/s (the current parameters). */
export const DEGREE_IDS: readonly string[] = ['ATC_ACC_P_MAX', 'ATC_ACC_R_MAX', 'ATC_ACC_Y_MAX']

/** The names of every parameter of the initial tune (the page writes no others). */
export const INITIAL_TUNE_IDS: readonly string[] = initialTune({ size: 10, cells: 1, chemistry: CHEMISTRIES[0] as Chemistry })
  .map(item => item.id)
