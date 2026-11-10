// What the parameter editor says, from plain values (no DOM). Vue's templates escape the text; the words come from
// the translations.
import type { EnumOption } from './enumField'
import type { Param } from './generated/app'
import { OTHER, groupOf } from './paramGroups'
import type { State } from './state'
import type { WriteStatus } from './useParams'
import type { ParamMeta } from './metadata'
import type { Translate } from './telemetryCards'

/** A line about the last write, and how it should look. */
export interface WriteNotice {
  /** The CSS class of the line (empty: plain text). */
  tone: 'error' | ''
  /** What it says. */
  text: string
  /** True when it is only for a screen reader (out of sight): the line is said, and nothing is shown. */
  hidden?: boolean
}

/**
 * Whether the connection is up and nothing is being written or wrong with the draft.
 *
 * @param state the connection, the draft's error and whether a write is under way
 * @returns true if a write could go ahead
 */
function isIdle(state: Pick<State, 'connection' | 'writing' | 'draftError'>): boolean {
  return state.connection.state === 'connected' && !state.writing && state.draftError === null
}

/**
 * Whether the write button does anything now.
 *
 * @param state the connection, the draft and whether a write is under way
 * @param param the selected parameter, if any
 * @returns true when connected, idle, and the draft is a valid value other than the current one
 */
export function canWrite(state: Pick<State, 'connection' | 'writing' | 'draftError' | 'draft'>, param: Param | null): boolean {
  if (param === null) {
    return false
  }

  return isIdle(state) && state.draft.trim() !== '' && Number(state.draft) !== param.value
}

/**
 * How a finished write went.
 *
 * @param write the last write
 * @param translate looks up a message
 * @returns the line; for a write the vehicle read back it is out of sight (the new value is in the list) but still said
 */
function outcomeOf(write: WriteStatus, translate: Translate): WriteNotice {
  if (write.kind === 'verified') {
    return { tone: '', hidden: true, text: translate('editor.verified', { value: write.value }) }
  }
  if (write.kind === 'changed') {
    // The vehicle holds another value than was asked: a problem, not a caution.
    return { tone: 'error', text: translate('editor.changed', { reported: write.reported, asked: write.asked }) }
  }

  return { tone: 'error', text: translate('editor.failed', { message: write.message }) }
}

/**
 * The line about the last write, for the selected parameter.
 *
 * @param writing whether a write is under way
 * @param last how the last write went
 * @param id the selected parameter
 * @param translate looks up a message
 * @returns the line, or null if there is nothing to say about this parameter (a write that was read back is said out of sight,
 * a failed or changed one is an error line)
 */
export function writeNotice(writing: boolean, last: WriteStatus | null, id: string, translate: Translate): WriteNotice | null {
  if (writing) {
    return { tone: '', text: translate('editor.writing') }
  }

  return last?.id === id ? outcomeOf(last, translate) : null
}

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
