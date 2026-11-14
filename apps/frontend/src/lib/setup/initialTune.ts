// The "Initial tune" values: what ArduPilot publishes as a starting point for a multicopter of a given propeller size and
// battery.
//
// SOURCE (read on 2026-11-14): https://ardupilot.org/copter/docs/setting-up-for-tuning.html, "Setting the Aircraft Up for
// Tuning". Under "PID Controller Initial Setup" it says:
//   "INS_ACCEL_FILTER: 10Hz"
//   "INS_GYRO_FILTER: 80Hz for 5 inch props, 40Hz for 10 inch props, 20Hz for 20 inch props (or larger)"
//   "ATC_ACC_P_MAX: 1100 for 10 inch props, 500 for 20 inch props, 200 for 30 inch props" (ATC_ACC_R_MAX the same)
//   "ATC_ACC_Y_MAX: 200 for 10 inch props, 100 for 20 inch props, 90 for 30 inch props"
//   "ATC_RAT_PIT_FLTD: INS_GYRO_FILTER / 2" (and ATC_RAT_PIT_FLTT, ATC_RAT_RLL_FLTD, ATC_RAT_RLL_FLTT, ATC_RAT_YAW_FLTT)
//   "ATC_RAT_YAW_FLTE: 2"
// and under "Battery setting":
//   "MOT_BAT_VOLT_MAX should be set to the maximum voltage of your batteries, e.g. 4.2v x No. Cells for standard LiPos"
//   "MOT_BAT_VOLT_MIN should be set to the minimum voltage of your batteries, e.g. 3.3v x No. Cells for standard LiPos"
//   "MOT_THST_EXPO: 0.55 for 5 inch props, 0.65 for 10 inch props, 0.75 for 20 inch props (or larger)."
// (the page adds that MOT_THST_EXPO "should be derived by thrust stand measurements for best results").
//
// Only the sizes the page gives are offered (5, 10, 20, 30 inch), and nothing is interpolated: where the page gives no value
// for a size (the three ATC_ACC_*_MAX of a 5 inch propeller) there is none here (`notGiven`). 30 inch takes the page's "20 inch
// props (or larger)" for INS_GYRO_FILTER and MOT_THST_EXPO. The voltages are those the page gives for standard LiPo cells, from
// the number of cells the user says. BATT_ARM_VOLT, BATT_CRT_VOLT and BATT_LOW_VOLT are not on the page and are not here. The
// filter values are worked out of the size chosen (the page's INS_GYRO_FILTER / 2), never of what the vehicle has now.

/** The propeller sizes (inches) the page gives values for. */
export const PROP_SIZES = [5, 10, 20, 30] as const

/** A propeller size. */
export type PropSize = typeof PROP_SIZES[number]

/** The most cells the page accepts (a 12S pack): the page names none, this is the interface's own bound. */
export const MAX_CELLS = 12

/** Why a parameter has no value to offer: the page gives none for this size, or the cells are not known yet. */
export type NoValue = 'notGiven' | 'cells'

/** One parameter of the initial tune. */
export interface Suggestion {
  /** The parameter's name (the current one: *_FLTD, *_FLTT, *_FLTE). */
  id: string
  /** The value, or null when there is none to offer. */
  value: number | null
  /** Why there is none. */
  why: NoValue | null
}

/** What the page gives by size; null where it gives nothing. */
type BySize = Record<PropSize, number | null>

const GYRO_FILTER: BySize = { 5: 80, 10: 40, 20: 20, 30: 20 }
const THRUST_EXPO: BySize = { 5: 0.55, 10: 0.65, 20: 0.75, 30: 0.75 }
const ACCEL_PITCH_ROLL_MAX: BySize = { 5: null, 10: 1100, 20: 500, 30: 200 }
const ACCEL_YAW_MAX: BySize = { 5: null, 10: 200, 20: 100, 30: 90 }
const ACCEL_FILTER_HZ = 10
const YAW_ERROR_FILTER_HZ = 2
const CELL_MAX_V = 4.2
const CELL_MIN_V = 3.3

/**
 * Whether a number is a size the page gives values for.
 *
 * @param size the number
 * @returns true for 5, 10, 20 and 30
 */
export function isPropSize(size: number): size is PropSize {
  return (PROP_SIZES as readonly number[]).includes(size)
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
 * A voltage for some cells, as a number of two decimals (4.2 x 3 is not 12.600000000000001).
 *
 * @param perCell the voltage of one cell
 * @param cells the cells, or null when they are not known
 * @returns the voltage, or null
 */
function pack(perCell: number, cells: number | null): number | null {
  return cells === null ? null : Math.round(perCell * cells * 100) / 100
}

/**
 * A suggestion.
 *
 * @param id the parameter
 * @param value the value, or null for none
 * @param why why there is none (when `value` is null)
 * @returns the suggestion
 */
function suggestion(id: string, value: number | null, why: NoValue = 'notGiven'): Suggestion {
  return { id, value, why: value === null ? why : null }
}

/**
 * The initial tune of a size and a number of cells.
 *
 * @param size the propeller size
 * @param cells the number of cells, or null when they are not known (the two voltages then have none)
 * @returns the parameters in the order of the page, each with its value or why it has none
 */
export function initialTune(size: PropSize, cells: number | null): Suggestion[] {
  const filter = GYRO_FILTER[size] ?? 0
  const half = filter / 2

  return [
    suggestion('INS_ACCEL_FILTER', ACCEL_FILTER_HZ),
    suggestion('INS_GYRO_FILTER', filter),
    suggestion('ATC_ACC_P_MAX', ACCEL_PITCH_ROLL_MAX[size]),
    suggestion('ATC_ACC_R_MAX', ACCEL_PITCH_ROLL_MAX[size]),
    suggestion('ATC_ACC_Y_MAX', ACCEL_YAW_MAX[size]),
    suggestion('ATC_RAT_RLL_FLTD', half),
    suggestion('ATC_RAT_RLL_FLTT', half),
    suggestion('ATC_RAT_PIT_FLTD', half),
    suggestion('ATC_RAT_PIT_FLTT', half),
    suggestion('ATC_RAT_YAW_FLTT', half),
    suggestion('ATC_RAT_YAW_FLTE', YAW_ERROR_FILTER_HZ),
    suggestion('MOT_THST_EXPO', THRUST_EXPO[size]),
    suggestion('MOT_BAT_VOLT_MAX', pack(CELL_MAX_V, cells), 'cells'),
    suggestion('MOT_BAT_VOLT_MIN', pack(CELL_MIN_V, cells), 'cells'),
  ]
}

/**
 * The greatest value an acceleration limit may have in ArduPilot's own range (deg/s/s, `@Range` of ATC_ACC_*_MAX in the 4.7.2
 * tree and in master). The older parameter of the same thing, in centi-degrees, is named ATC_ACCEL_*_MAX: a vehicle that has the
 * name used here and a value above this has a value in another unit, and a suggestion in deg/s/s must not be written over it.
 */
const ACCEL_RANGE_MAX: Record<string, number> = { ATC_ACC_P_MAX: 1800, ATC_ACC_R_MAX: 1800, ATC_ACC_Y_MAX: 720 }

/**
 * Whether the vehicle's value of a parameter is beyond the range the page's value is in.
 *
 * @param id the parameter
 * @param now the vehicle's value, or null when it has none
 * @returns true for an acceleration limit above its range
 */
export function beyondRange(id: string, now: number | null): boolean {
  const max = ACCEL_RANGE_MAX[id]

  return max !== undefined && now !== null && now > max
}

/** The names of every parameter of the initial tune (the page writes no others). */
export const INITIAL_TUNE_IDS: readonly string[] = initialTune(10, 1).map(item => item.id)
