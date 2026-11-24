// Parameters a later firmware renamed (#202): a file or a snapshot from an older firmware names RTL_ALT where the vehicle has
// RTL_ALT_M. Such a value is offered under the vehicle's name, with the value converted the way the firmware converts it on its
// own (centimetres to metres and so on), instead of being reported as not on the vehicle. The table is ArduPilot's own rules
// (renameTable.ts, loaded when a review needs it); nothing here writes.
import type { Param } from '@/generated/app'
import type { WantedValue } from './paramDiff'

/** The kinds of vehicle a rename is for, as ArduPilot's firmwares are split. */
export type VehicleFamily = 'copter' | 'plane' | 'rover'

/** A conversion that is not a scale: ARMING_CHECK's checks to run become ARMING_SKIPCHK's checks to skip. */
export type Conversion = 'skipChecks'

/** One rename: the old name, the new, the line of the firmware that converts it, and the units before and after if changed. */
export type RenameRow = readonly [from: string, to: string, line: number, fromUnit?: string, toUnit?: string]

/** The renames of one conversion site of the firmware. */
export interface RenameGroup {
  /** The first release with the new names (`4.7`). */
  since: string
  /** The vehicles the firmware renames them for. */
  vehicles: readonly VehicleFamily[]
  /** What the firmware multiplies the old value by (1 when it is not given). */
  scale?: number
  /** A conversion other than a scale, if the firmware makes one. */
  convert?: Conversion
  /** The release whose source was read (`Copter-4.7.3`). */
  release: string
  /** The file of the firmware, from the top of ArduPilot's tree. */
  file: string
  /** The renames. */
  renames: readonly RenameRow[]
}

/** One rename, ready to apply. */
export interface Rename {
  /** The old name. */
  from: string
  /** The new name. */
  to: string
  /** The first release with the new name. */
  since: string
  /** The vehicles it is for. */
  vehicles: readonly VehicleFamily[]
  /** What the old value is multiplied by. */
  scale: number
  /** A conversion other than a scale, if any. */
  convert?: Conversion
  /** The units of the old and the new value, when they differ. */
  units?: { from: string, to: string }
  /** Where the firmware converts it: `file:line (release)`. */
  source: string
}

/** The renames by their old name (some old names have a rename for each kind of vehicle). */
export type RenameTable = ReadonlyMap<string, readonly Rename[]>

/** What decides whether a rename applies: the table, and what the vehicle is, when known. */
export interface RenameContext {
  /** The renames. */
  table: RenameTable
  /** The kind of vehicle, if known: a rename for another kind does not apply. */
  family?: VehicleFamily
  /** The firmware version the vehicle reports (AUTOPILOT_VERSION, `4.7.2`), if known: a later release's rename does not apply. */
  version?: string
}

/** How a value came to be under its new name: shown beside it, so that both values are seen before anything is written. */
export interface Renamed {
  /** The old name, as the file or snapshot has it. */
  from: string
  /** The first release with the new name. */
  since: string
  /** The value as the file or snapshot has it. */
  value: number
  /** The units of the old and the new value, when they differ. */
  units?: { from: string, to: string }
}

/** ARMING_SKIPCHK's checks as the firmware knew them when it converted ARMING_CHECK: bits 1 to 20 (AP_Arming.cpp, 4.7.3). */
const SKIP_CHECKS_MASK = 0x1F_FF_FE

/** ARMING_CHECK's "all checks" bit. */
const ALL_CHECKS = 1

/**
 * ARMING_SKIPCHK from ARMING_CHECK, as the firmware converts it: no checks (0) skips every check (-1), the "all" bit skips none,
 * and otherwise the checks not run are the ones skipped.
 *
 * @param checks ARMING_CHECK
 * @returns ARMING_SKIPCHK
 */
export function skipChecks(checks: number): number {
  if (checks === 0) {
    return -1
  }

  return (checks & ALL_CHECKS) === ALL_CHECKS ? 0 : ~checks & SKIP_CHECKS_MASK
}

/**
 * The units of a rename, when the row gives both.
 *
 * @param from the unit of the old value
 * @param to the unit of the new value, if given
 * @returns the units, or nothing
 */
function unitsOf(from: string, to: string | undefined): Pick<Rename, 'units'> {
  return to === undefined ? {} : { units: { from, to } }
}

/**
 * A rename of the table, from its row and its group.
 *
 * @param row the row
 * @param group its group
 * @returns the rename
 */
function renameOf(row: RenameRow, group: RenameGroup): Rename {
  const [from, to, line, fromUnit, toUnit] = row
  const units = fromUnit === undefined ? {} : unitsOf(fromUnit, toUnit)
  const convert = group.convert === undefined ? {} : { convert: group.convert }
  const { since, vehicles, scale = 1, file, release } = group

  return { from, to, since, vehicles, scale, ...convert, ...units, source: `${file}:${line} (${release})` }
}

/**
 * The table, by old name.
 *
 * @param groups the groups of renames (renameTable.ts)
 * @returns the renames by their old name, in the order of the groups
 */
export function renameTable(groups: readonly RenameGroup[]): RenameTable {
  const table = new Map<string, Rename[]>()
  for (const rename of groups.flatMap(group => group.renames.map(row => renameOf(row, group)))) {
    table.set(rename.from, [...(table.get(rename.from) ?? []), rename])
  }

  return table
}

/**
 * Loads ArduPilot's table and puts it by old name.
 *
 * @returns the table
 */
async function loadTable(): Promise<RenameTable> {
  const { RENAME_GROUPS } = await import('./renameTable')

  return renameTable(RENAME_GROUPS)
}

/** The table, loaded once: it is a chunk of its own, fetched the first time a review needs it. */
let loaded: Promise<RenameTable> | null = null

/**
 * The table of ArduPilot's renames, loaded when first asked for.
 *
 * @returns the table
 */
export function loadRenames(): Promise<RenameTable> {
  loaded ??= loadTable()

  return loaded
}

/** The vehicle types (MAV_TYPE names) of each kind of vehicle. */
const FAMILIES: Readonly<Record<string, VehicleFamily>> = {
  QUADROTOR: 'copter', HEXAROTOR: 'copter', OCTOROTOR: 'copter', TRICOPTER: 'copter', COAXIAL: 'copter', DECAROTOR: 'copter',
  DODECAROTOR: 'copter', HELICOPTER: 'copter',
  FIXED_WING: 'plane', VTOL_TAILSITTER_DUOROTOR: 'plane', VTOL_TAILSITTER_QUADROTOR: 'plane', VTOL_TILTROTOR: 'plane',
  VTOL_FIXEDROTOR: 'plane', VTOL_TAILSITTER: 'plane', VTOL_TILTWING: 'plane',
  GROUND_ROVER: 'rover', SURFACE_BOAT: 'rover',
}

/**
 * The kind of vehicle of a vehicle type.
 *
 * @param type the vehicle's type as the connection says it (`QUADROTOR`), if known
 * @returns the kind, or undefined for another or no vehicle
 */
export function familyOf(type: string | undefined): VehicleFamily | undefined {
  return type === undefined ? undefined : FAMILIES[type]
}

/**
 * The numbers of a version (`4.7.2-beta1` gives 4, 7, 2).
 *
 * @param version the version
 * @returns its numbers
 */
const numbersOf = (version: string) => version.split(/[.-]/u).slice(0, 3).map(part => Number.parseInt(part, 10) || 0)

/** A version whose numbers can be read: it starts with a major and a minor number. */
const READABLE_VERSION = /^\d+\.\d+/u

/**
 * How two versions' numbers compare.
 *
 * @param have the numbers of one
 * @param want the numbers of the other
 * @returns below 0 when the first is earlier, 0 when they are the same as far as the second goes, above 0 when it is later
 */
function compareNumbers(have: number[], want: number[]): number {
  const differing = want.findIndex((part, i) => (have[i] ?? 0) !== part)

  return differing === -1 ? 0 : (have[differing] ?? 0) - (want[differing] ?? 0)
}

/**
 * Whether a firmware version is the release given or later.
 *
 * @param version the firmware's version
 * @param since the release (`4.7`)
 * @returns true if it is, or if the version can't be read
 */
export function atLeast(version: string, since: string): boolean {
  return !READABLE_VERSION.test(version) || compareNumbers(numbersOf(version), numbersOf(since)) >= 0
}

/**
 * What decides the renames, with only what is known of the vehicle.
 *
 * @param table the renames
 * @param family the kind of vehicle, if known
 * @param version the firmware version, if known
 * @returns the context
 */
export function renameContext(table: RenameTable, family?: VehicleFamily, version?: string): RenameContext {
  return { table, ...(family ? { family } : {}), ...(version ? { version } : {}) }
}

/**
 * Whether a rename can apply to the vehicle at all: it is for its kind and its release, as far as they are known.
 *
 * @param rename the rename
 * @param context what the vehicle is
 * @returns true if it can
 */
function fitsVehicle(rename: Rename, context: RenameContext): boolean {
  const { family, version } = context
  const kind = family === undefined || rename.vehicles.includes(family)

  return kind && (version === undefined || atLeast(version, rename.since))
}

/**
 * The rename of an old name on this vehicle: the vehicle has the new name and not the old one, and the rename is for its kind
 * of vehicle and its release.
 *
 * @param id the name as a file or snapshot has it
 * @param names the vehicle's parameter names
 * @param context the table and what the vehicle is
 * @returns the rename, or undefined
 */
export function renameFor(id: string, names: ReadonlySet<string>, context: RenameContext): Rename | undefined {
  if (names.has(id)) {
    return undefined
  }

  return context.table.get(id)?.find(rename => names.has(rename.to) && fitsVehicle(rename, context))
}

/**
 * A value converted the way the firmware converts it with the name: scaled (to 12 significant digits, so that 3000 × 0.01 is
 * 30), or turned from checks to run into checks to skip.
 *
 * @param rename the rename
 * @param value the old value
 * @returns the new value
 */
export function convertValue(rename: Rename, value: number): number {
  if (rename.convert === 'skipChecks') {
    return skipChecks(value)
  }

  return rename.scale === 1 ? value : Number((value * rename.scale).toPrecision(12))
}

/**
 * A wanted value under its new name, with the value converted and where it came from. Its type is the old parameter's, so it is
 * not held against the new one's.
 *
 * @param wanted the value under its old name
 * @param rename the rename
 * @returns the value under the new name
 */
function renamedValue(wanted: WantedValue, rename: Rename): WantedValue {
  const units = rename.units ? { units: rename.units } : {}
  const renamed: Renamed = { from: rename.from, since: rename.since, value: wanted.value, ...units }
  const problem = wanted.problem === undefined ? {} : { problem: wanted.problem }

  return { id: rename.to, value: convertValue(rename, wanted.value), ...problem, renamed }
}

/**
 * The wanted values with the old names this vehicle's firmware has renamed put under their new names (and converted). A value
 * whose new name the file or snapshot has too stays under its old name: the new one counts, the old one is not on the vehicle.
 *
 * @param wanted the values, as the file or snapshot names them
 * @param params the vehicle's parameters
 * @param context the table and what the vehicle is
 * @returns the values, renamed where the firmware renamed them
 */
export function renameWanted(wanted: readonly WantedValue[], params: readonly Param[], context: RenameContext): WantedValue[] {
  const names = new Set(params.map(param => param.id))
  const named = new Set(wanted.map(value => value.id))

  return wanted.map(value => {
    const rename = renameFor(value.id, names, context)

    return rename && !named.has(rename.to) ? renamedValue(value, rename) : value
  })
}
