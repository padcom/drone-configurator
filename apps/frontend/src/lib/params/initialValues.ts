// The initial values of the parameters: what each had when the list was last downloaded whole (the last complete download).
// They are what "changed from its initial value" is measured against, and what a reset puts back. Not the firmware's defaults:
// nothing here knows those. From plain values (no DOM).
import type { Param } from '@/generated/app'
import { canonical } from './paramValue'

/** The values at the last complete download. */
export interface Initial {
  /** The value of each parameter, by name. */
  values: ReadonlyMap<string, number>
  /** When the download completed (ms since the epoch). */
  at: number
}

/**
 * The initial values of a list that was just downloaded whole.
 *
 * @param params the list
 * @param at when the download completed (ms)
 * @returns the initial values
 */
export function initialOf(params: Param[], at: number): Initial {
  return { values: new Map(params.map(param => [param.id, param.value])), at }
}

/**
 * The parameters whose value is not their initial value now (a parameter that has none, because it was not in the download, is
 * not one: there is nothing to compare it with). It counts every way a value changed: a write of ours, another ground station,
 * the autopilot itself.
 *
 * @param params the list now
 * @param initial the initial values, if a download completed
 * @returns the names
 */
export function changedIds(params: Param[], initial: Initial | null): Set<string> {
  if (initial === null) {
    return new Set()
  }

  const moved = (param: Param) => {
    const was = initial.values.get(param.id)

    // As the vehicle holds them (a -0 is a 0), and with Object.is: a NaN from the wire is the same as itself.
    return was !== undefined && !Object.is(canonical(param, was), canonical(param, param.value))
  }

  return new Set(params.filter(moved).map(param => param.id))
}

/**
 * The initial value of a parameter that is not at it.
 *
 * @param id the parameter's name, if there is one
 * @param changed the parameters that are not at their initial values
 * @param initial the initial values, if a download completed
 * @returns the initial value, or undefined when the parameter is at it (or has none)
 */
export function initialIfChanged(
  id: string | undefined,
  changed: ReadonlySet<string>,
  initial: Initial | null,
): number | undefined {
  return id !== undefined && changed.has(id) ? initial?.values.get(id) : undefined
}

/** One parameter to be put back to its initial value. */
export interface ResetTarget {
  /** The parameter's name. */
  id: string
  /** The value to put back. */
  to: number
}

/**
 * What "Reset N changed to initial values" puts back: every parameter that is not at its initial value, except the counters
 * that the vehicle keeps by itself (STAT_*), which a bulk reset leaves alone.
 *
 * @param params the list now
 * @param initial the initial values, if a download completed
 * @param skip whether a name is one the bulk reset leaves alone
 * @returns the parameters and the values to put back, in the list's order
 */
export function resetTargets(params: Param[], initial: Initial | null, skip: (id: string) => boolean): ResetTarget[] {
  const changed = changedIds(params, initial)

  const wanted = params.filter(param => changed.has(param.id) && !skip(param.id))

  return wanted.map(param => ({ id: param.id, to: initial?.values.get(param.id) ?? param.value }))
}

/**
 * The time of a download as a clock shows it.
 *
 * @param ms milliseconds since the epoch
 * @returns hours, minutes and seconds in the local time, as 14:02:11
 */
export function clockText(ms: number): string {
  const time = new Date(ms)

  return [time.getHours(), time.getMinutes(), time.getSeconds()].map(part => String(part).padStart(2, '0')).join(':')
}
