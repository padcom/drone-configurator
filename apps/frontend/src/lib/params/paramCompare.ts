// The vehicle's parameters side by side with another set of values (a parameter file, a snapshot of this or another vehicle, the
// firmware's defaults), row by row: which are the same, which differ, which only one side has. Nothing here writes: a row that
// differs can be copied across, which puts it in the review (paramDiff's changes), and only what the user ticks there and
// confirms is written (useSnapshots).
import { say } from '@/i18n/say'
import type { Param, VehicleInfo } from '@/generated/app'
import { type Change, type DiffOptions, type WantedValue, changeFor, withRenames } from './paramDiff'
import { groupOf } from './paramGroups'
import type { ParamMeta } from './metadata'
import { looksLikeJson, parseParamFile } from './paramFile'
import { fileNotes, wantedOf } from './paramFileReview'
import { type ReviewSource, parseSnapshot, warningFor } from './snapshot'
import { showNumber } from './paramValue'
import type { Renamed } from './renames'

/** How a row compares: the same on both sides, different, or on one side only. */
export type CompareStatus = 'same' | 'differs' | 'vehicleOnly' | 'otherOnly'

/** One parameter, on the vehicle and on the other side. */
export interface CompareRow {
  /** The parameter's id. */
  id: string
  /** The vehicle's parameter, or null when the vehicle has none of that name. */
  param: Param | null
  /** The value on the other side, or null when it has none. */
  other: number | null
  /** How the two compare. */
  status: CompareStatus
  /** What copying the other value across would change (with why it can't, if so), or null when there is nothing to copy. */
  change: Change | null
  /** The old name and value, when the other side names the parameter as an older firmware did (#202). */
  renamed?: Renamed
}

/** The other side of a comparison: where its values come from, and what they are. */
export interface CompareSide {
  /** Where the values come from (a file, a snapshot, the defaults). */
  source: ReviewSource
  /** The values. */
  wanted: WantedValue[]
  /** A different vehicle type or autopilot than the one connected (a snapshot of another vehicle), if so. */
  vehicleWarning: string | null
  /** What the file has that is not a value (a name twice, a line that is not a parameter). */
  notes: string[]
}

/** How many rows of each kind there are. */
export type CompareCounts = Record<CompareStatus, number>

/** Which rows show. */
export interface CompareFilter {
  /** Only the rows that are not the same on both sides. */
  onlyDifferences: boolean
  /** Only the rows of this group (what comes before the first underscore), or every group for ''. */
  group: string
  /** Only the rows whose name, or description in the metadata, holds this text (any case), or every row for ''. */
  search: string
}

/**
 * The row of a parameter the vehicle has.
 *
 * @param param the vehicle's parameter
 * @param wanted the other side's value, if it has one
 * @param options the metadata
 * @returns the row
 */
function vehicleRow(param: Param, wanted: WantedValue | undefined, options: DiffOptions): CompareRow {
  if (!wanted) {
    return { id: param.id, param, other: null, status: 'vehicleOnly', change: null }
  }
  const change = changeFor(wanted, param, options)
  const renamed = wanted.renamed ? { renamed: wanted.renamed } : {}

  return { id: param.id, param, other: wanted.value, status: change ? 'differs' : 'same', change, ...renamed }
}

/**
 * The row of a value the vehicle has no parameter for: it can't be copied ("not on this vehicle").
 *
 * @param wanted the value
 * @returns the row
 */
function otherRow(wanted: WantedValue): CompareRow {
  return { id: wanted.id, param: null, other: wanted.value, status: 'otherOnly', change: changeFor(wanted, undefined) }
}

/**
 * The vehicle's parameters next to the other side's values: the vehicle's in its order, then what only the other side has, in
 * its order. A name the other side has twice counts once, with its last value (as ArduPilot reads a file).
 *
 * @param wanted the other side's values
 * @param params the vehicle's parameters now
 * @param options the metadata, if loaded, and the renames: a name the vehicle's firmware renamed is compared under its new name
 * @returns the rows
 */
export function compareValues(wanted: WantedValue[], params: Param[], options: DiffOptions = {}): CompareRow[] {
  const byId = new Map(withRenames(wanted, params, options).map(value => [value.id, value]))
  const onVehicle = new Set(params.map(param => param.id))
  const others = [...byId.values()].filter(value => !onVehicle.has(value.id))

  return [...params.map(param => vehicleRow(param, byId.get(param.id), options)), ...others.map(otherRow)]
}

/**
 * How many rows of each kind there are.
 *
 * @param rows the rows
 * @returns the counts
 */
export function countsOf(rows: readonly CompareRow[]): CompareCounts {
  const counts: CompareCounts = { same: 0, differs: 0, vehicleOnly: 0, otherOnly: 0 }
  for (const row of rows) {
    counts[row.status] += 1
  }

  return counts
}

/**
 * Whether a row can be copied across: it differs, and the change can be made.
 *
 * @param row the row
 * @returns true if it can
 */
export function copyable(row: CompareRow): boolean {
  return row.change !== null && row.change.problem === null && row.param !== null
}

/**
 * Whether a row's name, or its description, holds the search.
 *
 * @param row the row
 * @param search the text, in capitals ('' holds every row)
 * @param describe the description of a parameter in the metadata ('' for none)
 * @returns true if it does
 */
function found(row: CompareRow, search: string, describe: (id: string) => string): boolean {
  return search === '' || row.id.includes(search) || describe(row.id).toUpperCase().includes(search)
}

/**
 * Whether a row is kept by the choice of differences and of group.
 *
 * @param row the row
 * @param filter the filter
 * @returns true if it is
 */
function kept(row: CompareRow, filter: CompareFilter): boolean {
  return (!filter.onlyDifferences || row.status !== 'same') && (filter.group === '' || groupOf(row.id) === filter.group)
}

/**
 * Whether a row shows under a filter.
 *
 * @param row the row
 * @param filter the filter
 * @param describe the description of a parameter in the metadata ('' for none)
 * @returns true if it shows
 */
export function rowShows(row: CompareRow, filter: CompareFilter, describe: (id: string) => string = () => ''): boolean {
  return kept(row, filter) && found(row, filter.search.trim().toUpperCase(), describe)
}

/**
 * The name of a value in the metadata (an enum's), if it has one.
 *
 * @param meta the parameter's metadata
 * @param value the value
 * @returns the name, or undefined
 */
const nameOf = (meta: ParamMeta | undefined, value: number) => meta?.values?.[String(value)]

/**
 * A number with its units, if it has some.
 *
 * @param number the number, as text
 * @param units the units, if any
 * @returns the text
 */
function withUnits(number: string, units: string | undefined): string {
  return units ? `${number} ${units}` : number
}

/**
 * A value as the comparison shows it: its name where the metadata has one (and the number after it), else the number (as
 * ArduPilot prints it: a REAL32 short, not as the double it became) with its units.
 *
 * @param value the value, or null for none
 * @param meta the parameter's metadata, if loaded
 * @returns the text ('' for no value)
 */
export function valueText(value: number | null, meta: ParamMeta | undefined): string {
  if (value === null) {
    return ''
  }
  const name = nameOf(meta, value)

  return name === undefined ? withUnits(showNumber(value), meta?.units) : `${name} (${showNumber(value)})`
}

/**
 * The other side from a snapshot.
 *
 * @param text the snapshot's JSON
 * @param vehicle the connected vehicle
 * @returns the side, or why it is not a snapshot
 */
function snapshotSide(text: string, vehicle: VehicleInfo | undefined): CompareSide | string {
  const snapshot = parseSnapshot(text)
  if (typeof snapshot === 'string') {
    return snapshot
  }

  return {
    source: { kind: 'snapshot', savedAt: snapshot.savedAt },
    wanted: snapshot.params,
    vehicleWarning: warningFor(snapshot.vehicle, vehicle),
    notes: [],
  }
}

/**
 * The other side from a plain-text parameter file.
 *
 * @param text the file's text
 * @param vehicle the connected vehicle
 * @returns the side, or why it is not a parameter file (it has no parameter lines)
 */
function fileSide(text: string, vehicle: VehicleInfo | undefined): CompareSide | string {
  const file = parseParamFile(text)
  if (file.entries.length === 0) {
    return say('reason.noParamLines')
  }

  return {
    source: { kind: 'file', format: file.format },
    wanted: file.entries.map(entry => wantedOf(entry, vehicle)),
    vehicleWarning: null,
    notes: fileNotes(file),
  }
}

/**
 * The other side of a comparison from a file's text: a snapshot (JSON) or one of ArduPilot's parameter files.
 *
 * @param text the file's text
 * @param vehicle the connected vehicle (a snapshot of another type says so; a line for another component is not copied)
 * @returns the side, or why the file is neither
 */
export function sideOfText(text: string, vehicle: VehicleInfo | undefined): CompareSide | string {
  return looksLikeJson(text) ? snapshotSide(text, vehicle) : fileSide(text, vehicle)
}

/**
 * The other side from the firmware's defaults.
 *
 * @param defaults the default of each parameter, as the vehicle gave them
 * @returns the side
 */
export function defaultsSide(defaults: { id: string, value: number }[]): CompareSide {
  const wanted = defaults.map(({ id, value }) => ({ id, value }))

  return { source: { kind: 'defaults' }, wanted, vehicleWarning: null, notes: [] }
}
