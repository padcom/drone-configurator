// What the parameter editor says, from plain values (no DOM). Vue's templates escape the text; the words come from
// the translations.
import { type BitOption, bitOptions } from './bitmask'
import type { EnumOption } from './enumField'
import type { Param } from './generated/app'
import { OTHER, groupOf } from './paramGroups'
import type { ParamMeta } from './metadata'
import type { Translate } from './telemetryCards'

/**
 * Which message says what the metadata did for the parameters.
 *
 * @param counts see `metadataText`
 * @param counts.matched parameters of the vehicle that the metadata has an entry for
 * @param counts.described parameters of the vehicle that the metadata has a description for
 * @param counts.total parameters the vehicle has
 * @returns the key of the message
 */
function metadataKey(counts: { matched: number, described: number, total: number }): string {
  if (counts.total === 0) {
    return 'params.metadata'
  }
  if (counts.matched === 0) {
    return 'params.metadataNone'
  }

  return counts.described === counts.matched ? 'params.metadataLoaded' : 'params.metadataSome'
}

/**
 * What the metadata line says when the last file loaded: how many of the vehicle's parameters it describes, and, when it
 * describes none of them, that, so that an empty Description column is never silent.
 *
 * @param counts how many of the vehicle's parameters the metadata has an entry for (matched) and a description for
 * (described), how many parameters the vehicle has (none before they are downloaded) and how many the metadata has
 * @param counts.matched parameters of the vehicle that the metadata has an entry for
 * @param counts.described parameters of the vehicle that the metadata has a description for
 * @param counts.total parameters the vehicle has
 * @param counts.known parameters the metadata has an entry for
 * @param translate looks up a message
 * @returns the text, or an empty string without metadata
 */
export function metadataText(
  counts: { matched: number, described: number, total: number, known: number },
  translate: Translate,
): string {
  const { matched, described, total, known } = counts
  if (known === 0) {
    return ''
  }

  return translate(metadataKey(counts), { count: known, matched, described, total, known })
}

/** How a metadata load is told: success, a warning (some of it matched), an error (none did, or the file was no good). */
export type ToastSeverity = 'success' | 'warning' | 'error'

/** The toast that tells how a metadata load went. */
export interface MetadataToast {
  /** How it is told. */
  severity: ToastSeverity
  /** What it says. */
  text: string
}

/** How each message of `metadataKey` is told. */
const KEY_SEVERITY: Record<string, ToastSeverity> = {
  'params.metadata': 'success',
  'params.metadataLoaded': 'success',
  'params.metadataSome': 'warning',
  'params.metadataNone': 'error',
}

/**
 * The toast for the metadata that was just loaded: success when every parameter of the vehicle that the file knows has a
 * description, a warning when some have none, an error when not one parameter of the vehicle is in the file.
 *
 * @param counts see `metadataText`
 * @param counts.matched parameters of the vehicle that the metadata has an entry for
 * @param counts.described parameters of the vehicle that the metadata has a description for
 * @param counts.total parameters the vehicle has
 * @param counts.known parameters the metadata has an entry for
 * @param translate looks up a message
 * @returns the toast, or null without metadata
 */
export function metadataToast(
  counts: { matched: number, described: number, total: number, known: number },
  translate: Translate,
): MetadataToast | null {
  const text = metadataText(counts, translate)

  return text === '' ? null : { severity: KEY_SEVERITY[metadataKey(counts)] ?? 'success', text }
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

/**
 * The bits the metadata names for a parameter, when it is an integer (a real is not a bit field). They win over named values.
 *
 * @param param the parameter, if one is selected
 * @param bits the metadata's bits for it, if it has any
 * @returns the named bits, lowest first, or null when there are none
 */
export function bitNamesOf(param: Param | null | undefined, bits: ParamMeta['bits']): BitOption[] | null {
  if (!param || param.kind !== 'int') {
    return null
  }
  const options = bitOptions(bits, param.type)

  return options.length === 0 ? null : options
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
