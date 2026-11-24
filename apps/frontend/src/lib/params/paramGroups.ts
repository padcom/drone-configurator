// The groups of the parameter list (no DOM), one of two ways (a grouping): by the name, where a parameter belongs to the group
// named by what comes before the first underscore ("BATT_CAPACITY" is in BATT), and one without an underscore is in OTHER; or by
// the metadata, where it belongs to the group ArduPilot's definitions have it in (the library, "INS_HNTCH", or the vehicle's own
// parameters, "ArduCopter"), and one the metadata does not place is in OTHER. The groups are names the vehicle and ArduPilot use,
// so nothing is invented. Two groups are the user's own: Favourites (the starred parameters) and Recently used.
import type { Param } from '@/generated/app'
import type { Metadata } from './metadata'
import { compareNames } from './naturalOrder'

/** The group of the parameters whose names have no underscore. */
export const OTHER = 'OTHER'

/** The id of the group of favourites: not a name a vehicle can have (a parameter's name is letters, digits and underscores). */
export const FAVOURITES_GROUP = '*favourites'

/** The id of the group of the recently used parameters (as Favourites, not a name a vehicle can have). */
export const RECENT_GROUP = '*recent'

/** The group a parameter is in, by its name. */
export type Grouping = (id: string) => string

/**
 * Whether a group is one of the user's own (Favourites, Recently used): its parameters are a list of names, not a grouping.
 *
 * @param group the group
 * @returns true for Favourites and Recently used
 */
export function isOwnGroup(group: string): boolean {
  return group === FAVOURITES_GROUP || group === RECENT_GROUP
}

/** One group of the list. */
export interface Group {
  /** Its name: what comes before the first underscore. */
  id: string
  /** How many parameters it holds. */
  count: number
}

/** A parameter name split for drawing: the group part is shown dimmed, the rest bright. */
export interface NameParts {
  /** The group's name and its underscore ("BATT_"), or empty when the name has none. */
  prefix: string
  /** The rest of the name. */
  rest: string
}

/**
 * The group a parameter is in.
 *
 * @param id the parameter's name
 * @returns the text before the first underscore, or OTHER when there is no underscore (or nothing before it)
 */
export function groupOf(id: string): string {
  const at = id.indexOf('_')

  return at > 0 ? id.slice(0, at) : OTHER
}

/**
 * The group a metadata group is, as a group of the list: without the underscore at its end ("BATT_" is BATT).
 *
 * @param group the group as ArduPilot's definitions name it
 * @returns its name in the list
 */
function listedGroup(group: string): string {
  return group.endsWith('_') && group.length > 1 ? group.slice(0, -1) : group
}

/**
 * The grouping by the metadata.
 *
 * @param metadata what the metadata says of the parameters
 * @returns the group of a parameter: the metadata's, or OTHER when the metadata does not place it
 */
export function metadataGrouping(metadata: Metadata): Grouping {
  return id => {
    const group = metadata.get(id)?.group

    return group ? listedGroup(group) : OTHER
  }
}

/**
 * Whether the metadata places parameters in groups (the grouping by it has something to show).
 *
 * @param metadata what the metadata says of the parameters
 * @returns true when some parameter has a group
 */
export function hasMetadataGroups(metadata: Metadata): boolean {
  return [...metadata.values()].some(meta => meta.group !== undefined)
}

/**
 * How many parameters each group has.
 *
 * @param params the parameters
 * @param grouping the group of a parameter
 * @returns the counts by group
 */
function tally(params: Param[], grouping: Grouping): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { id } of params) {
    const group = grouping(id)
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }

  return counts
}

/**
 * The groups of a list, by name; OTHER last.
 *
 * @param params every parameter (the groups are theirs)
 * @param counted the parameters the counts are of (a view's): a group with none of them stays, with a count of none
 * @param grouping the group of a parameter (by its name, unless the metadata's is asked for)
 * @returns each group with its count
 */
export function groupsOf(params: Param[], counted: Param[] = params, grouping: Grouping = groupOf): Group[] {
  const counts = tally(counted, grouping)

  return [...new Set(params.map(param => grouping(param.id)))]
    .map(id => ({ id, count: counts.get(id) ?? 0 }))
    .sort((a, b) => Number(a.id === OTHER) - Number(b.id === OTHER) || compareNames(a.id, b.id))
}

/**
 * Whether a parameter is in the chosen group.
 *
 * @param id the parameter's name
 * @param group the chosen group, or an empty string for all of them
 * @param grouping the group of a parameter (by its name, unless the metadata's is asked for)
 * @returns true when it is in it
 */
export function inGroup(id: string, group: string, grouping: Grouping = groupOf): boolean {
  return group === '' || grouping(id) === group
}

/**
 * The group that is really chosen: the one asked for if the list has it, else all (a group that is gone, because the vehicle
 * is another one, must not leave the list empty).
 *
 * @param params every parameter
 * @param chosen the group asked for, or an empty string for all
 * @param grouping the group of a parameter (by its name, unless the metadata's is asked for)
 * @returns the group to show
 */
export function effectiveGroup(params: Param[], chosen: string, grouping: Grouping = groupOf): string {
  return isOwnGroup(chosen) || params.some(param => grouping(param.id) === chosen) ? chosen : ''
}

/**
 * A name split for drawing.
 *
 * @param id the parameter's name
 * @returns the dimmed prefix and the rest
 */
export function splitName(id: string): NameParts {
  const at = id.indexOf('_')

  return at > 0 ? { prefix: id.slice(0, at + 1), rest: id.slice(at + 1) } : { prefix: '', rest: id }
}
