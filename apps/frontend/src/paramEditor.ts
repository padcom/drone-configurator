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
  tone: 'ok' | 'warn' | 'error' | ''
  /** What it says. */
  text: string
}

/** What the metadata knows about the selected parameter, as lines of text (null: nothing to say). */
export interface ParamDetails {
  /** The unit, with a space before it, or an empty string. */
  units: string
  /** The name of the current value, in brackets with a space before it, or an empty string. */
  named: string
  /** What the parameter is for. */
  description: string | null
  /** The allowed range. */
  range: string | null
  /** The allowed values and their names. */
  values: string | null
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
 * The unit as it follows a number.
 *
 * @param meta what the metadata says about the parameter
 * @returns the unit with a space before it, or an empty string
 */
function unitsOf(meta: ParamMeta | undefined): string {
  return meta?.units ? ` ${meta.units}` : ''
}

/**
 * One end of a range.
 *
 * @param limit the limit, if the metadata has it
 * @param translate looks up a message
 * @returns the number, or the sign for an open end
 */
const bound = (limit: number | undefined, translate: Translate) => limit ?? translate('editor.openEnd')

/**
 * The range the metadata allows.
 *
 * @param meta what the metadata says about the parameter
 * @param units the unit, as `unitsOf` returns it
 * @param translate looks up a message
 * @returns the sentence, or null without a limit
 */
function rangeOf(meta: ParamMeta | undefined, units: string, translate: Translate): string | null {
  const { min, max } = meta ?? {}
  if (min === undefined && max === undefined) {
    return null
  }

  return translate('editor.range', { min: bound(min, translate), max: bound(max, translate), units })
}

/**
 * The allowed values and their names.
 *
 * @param meta what the metadata says about the parameter
 * @param translate looks up a message
 * @returns the sentence, or null without named values
 */
function valuesOf(meta: ParamMeta | undefined, translate: Translate): string | null {
  if (!meta?.values) {
    return null
  }

  return translate('editor.values', { list: Object.entries(meta.values).map(([value, name]) => `${value} ${name}`).join(', ') })
}

/**
 * The name the metadata gives the current value.
 *
 * @param meta what the metadata says about the parameter
 * @param value the current value
 * @param translate looks up a message
 * @returns the name in brackets with a space before it, or an empty string
 */
function namedOf(meta: ParamMeta | undefined, value: number, translate: Translate): string {
  const name = meta?.values?.[String(value)]

  return name ? translate('editor.named', { name }) : ''
}

/**
 * What the metadata adds to the selected parameter.
 *
 * @param meta what the metadata says about it, if anything
 * @param value its current value on the vehicle
 * @param translate looks up a message
 * @returns the lines to show
 */
export function detailsOf(meta: ParamMeta | undefined, value: number, translate: Translate): ParamDetails {
  const units = unitsOf(meta)

  return {
    units,
    named: namedOf(meta, value, translate),
    description: meta?.description ?? null,
    range: rangeOf(meta, units, translate),
    values: valuesOf(meta, translate),
  }
}

/**
 * How a finished write went.
 *
 * @param write the last write
 * @param translate looks up a message
 * @returns the line to show
 */
function outcomeOf(write: WriteStatus, translate: Translate): WriteNotice {
  if (write.kind === 'verified') {
    return { tone: 'ok', text: translate('editor.verified', { value: write.value }) }
  }
  if (write.kind === 'changed') {
    return { tone: 'warn', text: translate('editor.changed', { reported: write.reported, asked: write.asked }) }
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
 * @returns the line, or null if there is nothing to say about this parameter
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
