// The firmware's defaults of the parameters: what "modified from default" is measured against. They come with a download by file
// transfer from a vehicle that has them (ArduPilot's parameter file, asked for with its defaults): the file gives a default only
// where it differs from the value, so a parameter it gives none for was at its default when the list was downloaded. A list that
// came another way (the list of PARAM_VALUEs, an older firmware) knows no defaults, and the filter is not offered. Not the
// initial values (initialValues.ts): those are what the vehicle had at the last download. From plain values (no DOM).
import type { Param } from '@/generated/app'
import { canonical } from './paramValue'

/** The firmware's default of each parameter of a list, by name. */
export type Defaults = ReadonlyMap<string, number>

/**
 * The defaults of a list that was just downloaded.
 *
 * @param params the list, each with its default where it differs from its value
 * @param known whether the list says it came with the defaults
 * @returns the default of every parameter, or null when they are not known
 */
export function defaultsOf(params: readonly Param[], known: boolean | undefined): Defaults | null {
  return known === true ? new Map(params.map(param => [param.id, param.default ?? param.value])) : null
}

/**
 * The parameters whose value is not the firmware's default now (one that has no default, because it was not in the download, is
 * not one: there is nothing to compare it with).
 *
 * @param params the list now
 * @param defaults the defaults, if known
 * @returns the names
 */
export function modifiedIds(params: readonly Param[], defaults: Defaults | null): Set<string> {
  if (defaults === null) {
    return new Set()
  }
  const moved = (param: Param) => {
    const was = defaults.get(param.id)

    // As the vehicle holds them (a float default and a float value compare as the REAL32 they are), and NaN is itself.
    return was !== undefined && !Object.is(canonical(param, was), canonical(param, param.value))
  }

  return new Set(params.filter(moved).map(param => param.id))
}
