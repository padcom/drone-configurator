// What a set of wanted values (a snapshot, a parameter file, and later the defaults, a frame preset or a log's parameters) would
// change on a vehicle, and why a change cannot be made. Nothing here writes: the review shows the changes, and only the ones the
// user ticks and confirms are written (useSnapshots).
import { say } from '@/i18n/say'
import { validateDraft } from './draft'
import type { Param } from '@/generated/app'
import { type Metadata, checkMeta } from './metadata'
import { canonical } from './paramValue'

/** One value that is wanted for a parameter. */
export interface WantedValue {
  /** The parameter's id. */
  id: string
  /** The value. */
  value: number
  /** Its kind (`int` or `real`), when the source says: a kind or type other than the vehicle's is not applied. */
  kind?: string
  /** Its type (INT8, REAL32 and so on), when the source says, with `kind`. */
  type?: string
  /** Why the source itself says it is not to be applied (a line for another component of the vehicle), if it does. */
  problem?: string
}

/** One parameter that would change, or why it can't. */
export interface Change {
  /** The parameter's id. */
  id: string
  /** Its value on the vehicle now, or null if the vehicle has none. */
  from: number | null
  /** The value wanted. */
  to: number
  /** Why it won't be written (unknown here, another type, read-only, an invalid value), or null. */
  problem: string | null
  /** What the metadata finds unusual about the value (outside its range, not one of its values), or null. A warning only. */
  warning: string | null
}

/** What applying the wanted values would change. */
export interface Diff {
  /** The parameters whose values differ (and the ones that can't be applied, with why), in the order they were wanted. */
  changes: Change[]
  /** How many are the same as on the vehicle already. */
  unchanged: number
}

/** What the diff looks at besides the values: the metadata, when it is loaded. */
export interface DiffOptions {
  /** The parameter metadata: its read-only parameters are not written, and its ranges and values give warnings. */
  metadata?: Metadata
}

/**
 * Parameters the vehicle keeps for itself, whatever the metadata says: ArduPilot ignores FORMAT_VERSION in a parameter file
 * (AP_Param::parse_param_line), and a different one would make the vehicle wipe its stored parameters.
 */
const KEPT_BY_VEHICLE = new Set(['FORMAT_VERSION'])

/**
 * Whether a wanted value and the vehicle's parameter are of different types (only when the source says what type it is).
 *
 * @param current the vehicle's parameter
 * @param wanted the wanted value
 * @returns true if the kind or the type differs
 */
function differentType(current: Param, wanted: WantedValue): boolean {
  return wanted.kind !== undefined && (current.kind !== wanted.kind || current.type !== wanted.type)
}

/**
 * Whether a parameter is one the vehicle sets itself and nobody is to write.
 *
 * @param id the parameter
 * @param metadata the metadata, if loaded
 * @returns true if it is read-only
 */
const isReadOnly = (id: string, metadata: Metadata | undefined) => KEPT_BY_VEHICLE.has(id) || metadata?.get(id)?.readOnly === true

/**
 * Why a value that differs is not written, if it is not: read-only, or not a value the vehicle's type can hold.
 *
 * @param current the vehicle's parameter
 * @param to the value as the source has it (a REAL32 too large for a float is said to be so, not shown as infinite)
 * @param options the metadata
 * @returns the problem, or null
 */
function valueProblem(current: Param, to: number, options: DiffOptions): string | null {
  return isReadOnly(current.id, options.metadata) ? say('problem.readOnly') : validateDraft(current, String(to))
}

/**
 * What the metadata finds unusual about a value.
 *
 * @param id the parameter
 * @param value the value, as the vehicle would hold it
 * @param options the metadata
 * @returns the warning, or null
 */
const warningOf = (id: string, value: number, options: DiffOptions) => checkMeta(options.metadata?.get(id), value)

/**
 * What applying a value that the vehicle has a parameter for would change.
 *
 * @param wanted the wanted value
 * @param current the vehicle's parameter
 * @param options the metadata
 * @returns the change, or null if the value is the same already
 */
function changeOf(wanted: WantedValue, current: Param, options: DiffOptions): Change | null {
  const { id, value: to } = wanted
  if (differentType(current, wanted)) {
    const problem = say('problem.otherType', { snapshot: wanted.type, vehicle: current.type })

    return { id, from: current.value, to, problem, warning: null }
  }
  // Compared, and written, as the numbers the vehicle holds (0.1 in a file is the same as the float that came back for it).
  const value = canonical(current, to)
  if (canonical(current, current.value) === value) {
    return null
  }
  const problem = valueProblem(current, to, options)

  return { id, from: current.value, to: value, problem, warning: problem ? null : warningOf(id, value, options) }
}

/**
 * What applying one wanted value would change.
 *
 * @param wanted the wanted value
 * @param current the vehicle's parameter, if it has one
 * @param options the metadata
 * @returns the change (with why it can't be applied, if so), or null if the value is the same already
 */
export function changeFor(wanted: WantedValue, current: Param | undefined, options: DiffOptions = {}): Change | null {
  const { id, value: to } = wanted
  if (!current) {
    return { id, from: null, to, problem: say('problem.notOnVehicle'), warning: null }
  }
  if (wanted.problem !== undefined) {
    return { id, from: current.value, to, problem: wanted.problem, warning: null }
  }

  return changeOf(wanted, current, options)
}

/**
 * What applying the wanted values to a vehicle with `params` would change.
 *
 * @param wanted the wanted values
 * @param params the vehicle's parameters now
 * @param options the metadata
 * @returns the changes, and how many are the same already
 */
export function diffValues(wanted: WantedValue[], params: Param[], options: DiffOptions = {}): Diff {
  const byId = new Map(params.map(param => [param.id, param]))
  const found = wanted.map(value => changeFor(value, byId.get(value.id), options))
  const changes = found.filter((change): change is Change => change !== null)

  return { changes, unchanged: found.length - changes.length }
}
