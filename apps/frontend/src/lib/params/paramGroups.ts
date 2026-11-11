// The groups of the parameter list, from the names alone (no DOM): a parameter belongs to the group named by what comes before
// the first underscore ("BATT_CAPACITY" is in BATT), and one without an underscore is in OTHER. The groups are the names the
// vehicle uses, so nothing is invented.
import type { Param } from '@/generated/app'
import { compareNames } from './naturalOrder'

/** The group of the parameters whose names have no underscore. */
export const OTHER = 'OTHER'

/** The id of the group of favourites: not a name a vehicle can have (a parameter's name is letters, digits and underscores). */
export const FAVOURITES_GROUP = '*favourites'

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
 * How many parameters each group has.
 *
 * @param params the parameters
 * @returns the counts by group
 */
function tally(params: Param[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { id } of params) {
    const group = groupOf(id)
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }

  return counts
}

/**
 * The groups of a list, by name; OTHER last.
 *
 * @param params every parameter (the groups are theirs)
 * @param counted the parameters the counts are of (a view's): a group with none of them stays, with a count of none
 * @returns each group with its count
 */
export function groupsOf(params: Param[], counted: Param[] = params): Group[] {
  const counts = tally(counted)

  return [...new Set(params.map(param => groupOf(param.id)))]
    .map(id => ({ id, count: counts.get(id) ?? 0 }))
    .sort((a, b) => Number(a.id === OTHER) - Number(b.id === OTHER) || compareNames(a.id, b.id))
}

/**
 * Whether a parameter is in the chosen group.
 *
 * @param id the parameter's name
 * @param group the chosen group, or an empty string for all of them
 * @returns true when it is in it
 */
export function inGroup(id: string, group: string): boolean {
  return group === '' || groupOf(id) === group
}

/**
 * The group that is really chosen: the one asked for if the list has it, else all (a group that is gone, because the vehicle
 * is another one, must not leave the list empty).
 *
 * @param params every parameter
 * @param chosen the group asked for, or an empty string for all
 * @returns the group to show
 */
export function effectiveGroup(params: Param[], chosen: string): string {
  return chosen === FAVOURITES_GROUP || groupsOf(params).some(group => group.id === chosen) ? chosen : ''
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
