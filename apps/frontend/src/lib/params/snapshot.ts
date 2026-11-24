// Parameter snapshots: a vehicle's parameters saved as JSON, and what loading one would change.
// Nothing here writes: only the changes the user picked and confirmed are applied (useSnapshots).
import { say } from '@/i18n/say'
import type { Param, VehicleInfo } from '@/generated/app'
import { type Diff, type DiffOptions, diffValues } from './paramDiff'
import type { ParamFileFormat } from './paramFile'

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

export type { Change } from './paramDiff'

/** The firmware's defaults, as the vehicle gives them (#40). */
export interface DefaultsSource {
  /** Always `defaults`. */
  kind: 'defaults'
}

/** A frame preset of ArduPilot's (#41): where in its tree it is, and at which git reference. */
export interface PresetSource {
  /** Always `preset`. */
  kind: 'preset'
  /** The git reference it was listed at: the vehicle's firmware tag (`Copter-4.7.3`) or `master`. */
  ref: string
  /** Its path under `Tools/Frame_params`. */
  path: string
}

/**
 * Where the values under review come from: a snapshot (and when it was saved), a parameter file (its format), the defaults, a
 * frame preset.
 */
export type ReviewSource
  = | { kind: 'snapshot', savedAt: string } | { kind: 'file', format: ParamFileFormat } | DefaultsSource | PresetSource

/** What loading a snapshot or a parameter file would do. */
export interface Review extends Diff {
  /** Where the values come from. */
  source: ReviewSource
  /** A different vehicle type or autopilot than the one connected, if so. */
  vehicleWarning: string | null
  /** What the file has that is not a change: names in it more than once, lines that are not parameters. */
  notes: string[]
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
export function warningFor(was: VehicleInfo | undefined, now: VehicleInfo | undefined): string | null {
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
 * @param options the metadata, if loaded (read-only parameters are not written, and its ranges give warnings)
 * @returns the review
 */
export function review(snapshot: Snapshot, params: Param[], vehicle: VehicleInfo | undefined, options: DiffOptions = {}): Review {
  return {
    source: { kind: 'snapshot', savedAt: snapshot.savedAt },
    ...diffValues(snapshot.params, params, options),
    vehicleWarning: warningFor(snapshot.vehicle, vehicle),
    notes: [],
  }
}
