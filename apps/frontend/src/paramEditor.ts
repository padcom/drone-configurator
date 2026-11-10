// What the parameter editor says, from plain values (no DOM). Vue's templates escape the text; the words come from
// the translations.
import type { EnumOption } from './enumField'
import type { Param } from './generated/app'
import { OTHER, groupOf } from './paramGroups'
import type { ParamMeta } from './metadata'
import type { Translate } from './telemetryCards'

/**
 * What the metadata line says when the last file loaded.
 *
 * @param count how many parameters the loaded metadata describes
 * @param translate looks up a message
 * @returns the text, or an empty string without metadata
 */
export function metadataText(count: number, translate: Translate): string {
  return count > 0 ? translate('params.metadata', { count }) : ''
}

/**
 * A number from the text of a draft.
 *
 * @param text what is in the field
 * @param fallback the number to use when the text is empty or not a number
 * @returns the number
 */
export function numberOr(text: string, fallback: number): number {
  const number = Number(text)

  return text.trim() === '' || !Number.isFinite(number) ? fallback : number
}

/**
 * The names the metadata gives to values.
 *
 * @param meta what the metadata says about the parameter, if anything
 * @returns the names by value (none when there are none)
 */
const namesIn = (meta: ParamMeta | undefined): Record<string, string> => meta?.values ?? {}

/**
 * The values the metadata names, as the options of a field of names.
 *
 * @param meta what the metadata says about the parameter, if anything
 * @returns the options in numeric order, or null without named values
 */
export function valueOptions(meta: ParamMeta | undefined): EnumOption[] | null {
  const entries = Object.entries(namesIn(meta)).map(([value, label]) => ({ value: Number(value), label }))
  const usable = entries.length > 0 && entries.every(option => Number.isFinite(option.value))

  return usable ? entries.sort((a, b) => a.value - b.value) : null
}

/** How many related parameters the detail lists. */
export const RELATED_SHOWN = 6

/**
 * The parameters related to one: the others of its group, in the list's order (none for those with no group of their own).
 *
 * @param params every parameter
 * @param id the selected parameter's name
 * @returns the names of up to RELATED_SHOWN of them
 */
export function relatedTo(params: Param[], id: string): string[] {
  const group = groupOf(id)
  if (group === OTHER) {
    return []
  }

  return params.filter(param => param.id !== id && groupOf(param.id) === group).map(param => param.id).slice(0, RELATED_SHOWN)
}
