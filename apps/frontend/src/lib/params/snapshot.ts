// Parameter snapshots: a vehicle's parameters saved as JSON, and what loading one would change.
// Nothing here writes: only the changes the user picked and confirmed are applied (useSnapshots).
import { say } from '@/i18n/say'
import { validateDraft } from './draft'
import type { Param, VehicleInfo } from '@/generated/app'
import { canonical } from './paramValue'

/** The `format` of a snapshot file. */
export const FORMAT = 'drone-configurator/params'

/** The `version` of a snapshot file that this app reads. */
export const VERSION = 1

/** One parameter of a snapshot. */
export type SnapshotParam = Pick<Param, 'id' | 'kind' | 'type' | 'value'>

/** A snapshot file. */
export interface Snapshot {
  /** Always `FORMAT`. */
  format: typeof FORMAT
  /** Always `VERSION`. */
  version: typeof VERSION
  /** When it was saved (ISO 8601). */
  savedAt: string
  /** The vehicle the parameters are from, if known. */
  vehicle?: VehicleInfo
  /** The parameters. */
  params: SnapshotParam[]
}

/**
 * The parameters as a snapshot.
 *
 * @param params what the vehicle reported
 * @param vehicle the vehicle they're from
 * @param now when (for tests)
 * @returns the snapshot as JSON text
 */
export function saveSnapshot(params: Param[], vehicle: VehicleInfo | undefined, now = new Date()): string {
  const snapshot: Snapshot = {
    format: FORMAT,
    version: VERSION,
    savedAt: now.toISOString(),
    ...(vehicle ? { vehicle } : {}),
    params: params.map(({ id, kind, type, value }) => ({ id, kind, type, value })),
  }

  return `${JSON.stringify(snapshot, null, 2)}\n`
}

/** One parameter a snapshot would change, or why it can't. */
export interface Change {
  /** The parameter's id. */
  id: string
  /** Its value on the vehicle now, or null if the vehicle has none. */
  from: number | null
  /** Its value in the snapshot. */
  to: number
  /** Why it won't be written (unknown here, another type, an invalid value), or null. */
  problem: string | null
}

/** What loading a snapshot would do. */
export interface Review {
  /** The snapshot under review. */
  snapshot: Snapshot
  /** Parameters whose values differ (and ones that can't be applied, with why). */
  changes: Change[]
  /** How many are the same as on the vehicle already. */
  unchanged: number
  /** A different vehicle type or autopilot than the one connected, if so. */
  vehicleWarning: string | null
}

/**
 * Whether a value is the kind of a parameter.
 *
 * @param kind anything
 * @returns true for `int` and `real`
 */
const isKind = (kind: unknown) => kind === 'int' || kind === 'real'

/**
 * Whether something names a parameter and says what kind it is.
 *
 * @param param anything from a snapshot file
 * @returns true if it has a text id and a kind
 */
const identifies = (param: Partial<SnapshotParam> | null) => typeof param?.id === 'string' && isKind(param.kind)

/**
 * Whether something is a parameter of a snapshot: an id, a kind, a type and a value.
 *
 * @param param anything from a snapshot file
 * @returns true if it is well formed
 */
function isSnapshotParam(param: Partial<SnapshotParam> | null): boolean {
  return identifies(param) && typeof param?.type === 'string' && typeof param.value === 'number'
}

/**
 * Why the snapshot's version is not the one this app reads.
 *
 * @param version the file's version
 * @returns the problem, or null
 */
function versionProblem(version: unknown): string | null {
  return version === VERSION ? null : say('reason.snapshotVersion', { version: String(version), supported: VERSION })
}

/**
 * Why a snapshot's parameters are not well formed, if they are not.
 *
 * @param params what the file held as parameters
 * @returns the problem, or null
 */
function paramsProblem(params: unknown): string | null {
  return Array.isArray(params) && params.every(isSnapshotParam) ? null : say('reason.malformed')
}

/**
 * Why a parsed file is not a snapshot.
 *
 * @param snapshot what the file held
 * @returns the problem, or null
 */
function problemWith(snapshot: Partial<Snapshot> | null): string | null {
  if (snapshot?.format !== FORMAT) {
    return say('reason.notSnapshot')
  }

  return versionProblem(snapshot.version) ?? paramsProblem(snapshot.params)
}

/**
 * Reads a snapshot.
 *
 * @param text the file's text
 * @returns the snapshot, or why it isn't one
 */
export function parseSnapshot(text: string): Snapshot | string {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return say('reason.notJson')
  }
  const snapshot = data as Partial<Snapshot> | null

  return problemWith(snapshot) ?? snapshot as Snapshot
}

/**
 * Whether a snapshot's parameter and the vehicle's are of different types.
 *
 * @param current the vehicle's parameter
 * @param wanted the snapshot's parameter
 * @returns true if the kind or the type differs
 */
const differentType = (current: Param, wanted: SnapshotParam) => current.kind !== wanted.kind || current.type !== wanted.type

/**
 * What loading one parameter of a snapshot would change.
 *
 * @param wanted the snapshot's parameter
 * @param current the vehicle's parameter, if it has one
 * @returns the change (with why it can't be applied, if so), or null if the value is the same already
 */
function changeFor(wanted: SnapshotParam, current: Param | undefined): Change | null {
  const { id, value: to } = wanted
  if (!current) {
    return { id, from: null, to, problem: say('problem.notOnVehicle') }
  }
  if (differentType(current, wanted)) {
    return { id, from: current.value, to, problem: say('problem.otherType', { snapshot: wanted.type, vehicle: current.type }) }
  }

  // Compared, and written, as the numbers the vehicle holds (0.1 in a file is the same as the float that came back for it).
  const value = canonical(current, to)

  if (canonical(current, current.value) === value) {
    return null
  }

  return { id, from: current.value, to: value, problem: validateDraft(current, String(to)) }
}

/**
 * Whether two vehicles are of different types or autopilots.
 *
 * @param was the vehicle the snapshot is from
 * @param now the connected vehicle
 * @returns true if they differ
 */
const differs = (was: VehicleInfo, now: VehicleInfo) => was.type !== now.type || was.autopilot !== now.autopilot

/**
 * The warning for a snapshot from a different vehicle.
 *
 * @param was the vehicle the snapshot is from, if known
 * @param now the connected vehicle, if any
 * @returns the warning, or null
 */
function warningFor(was: VehicleInfo | undefined, now: VehicleInfo | undefined): string | null {
  if (!was || !now || !differs(was, now)) {
    return null
  }

  return say('problem.otherVehicle', { was: was.type, wasAutopilot: was.autopilot, now: now.type, nowAutopilot: now.autopilot })
}

/**
 * What loading `snapshot` would change on a vehicle with `params`.
 *
 * @param snapshot the snapshot
 * @param params the vehicle's parameters now
 * @param vehicle the connected vehicle
 * @returns the review
 */
export function review(snapshot: Snapshot, params: Param[], vehicle: VehicleInfo | undefined): Review {
  const byId = new Map(params.map(param => [param.id, param]))
  const found = snapshot.params.map(wanted => changeFor(wanted, byId.get(wanted.id)))
  const changes = found.filter((change): change is Change => change !== null)

  return { snapshot, changes, unchanged: found.length - changes.length, vehicleWarning: warningFor(snapshot.vehicle, vehicle) }
}
