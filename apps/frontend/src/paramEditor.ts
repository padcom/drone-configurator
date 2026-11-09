// What the parameter editor says, from plain values (no DOM). Vue's templates escape the text.
import type { Param } from './generated/app'
import type { State, WriteStatus } from './configurator'
import type { ParamMeta } from './metadata'

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
 * @returns the number, or an ellipsis for an open end
 */
const bound = (limit: number | undefined) => limit ?? '…'

/**
 * The range the metadata allows.
 *
 * @param meta what the metadata says about the parameter
 * @param units the unit, as `unitsOf` returns it
 * @returns the sentence, or null without a limit
 */
function rangeOf(meta: ParamMeta | undefined, units: string): string | null {
  if (!meta || (meta.min === undefined && meta.max === undefined)) {
    return null
  }

  return `Range: ${bound(meta.min)} to ${bound(meta.max)}${units}`
}

/**
 * The allowed values and their names.
 *
 * @param meta what the metadata says about the parameter
 * @returns the sentence, or null without named values
 */
function valuesOf(meta: ParamMeta | undefined): string | null {
  return meta?.values ? `Values: ${Object.entries(meta.values).map(([value, name]) => `${value} ${name}`).join(', ')}` : null
}

/**
 * The name the metadata gives the current value.
 *
 * @param meta what the metadata says about the parameter
 * @param value the current value
 * @returns the name in brackets with a space before it, or an empty string
 */
function namedOf(meta: ParamMeta | undefined, value: number): string {
  const name = meta?.values?.[String(value)]

  return name ? ` (${name})` : ''
}

/**
 * What the metadata adds to the selected parameter.
 *
 * @param meta what the metadata says about it, if anything
 * @param value its current value on the vehicle
 * @returns the lines to show
 */
export function detailsOf(meta: ParamMeta | undefined, value: number): ParamDetails {
  const units = unitsOf(meta)

  return {
    units,
    named: namedOf(meta, value),
    description: meta?.description ?? null,
    range: rangeOf(meta, units),
    values: valuesOf(meta),
  }
}

/**
 * How a finished write went.
 *
 * @param write the last write
 * @returns the line to show
 */
function outcomeOf(write: WriteStatus): WriteNotice {
  if (write.kind === 'verified') {
    return { tone: 'ok', text: `Written and read back: ${write.value}.` }
  }
  if (write.kind === 'changed') {
    const { reported, asked } = write

    return { tone: 'warn', text: `The vehicle reports ${reported}, not ${asked}: it changed or refused the value.` }
  }

  return {
    tone: 'error',
    text: `Not confirmed: ${write.message}. The value on the vehicle is unknown; download again to see it.`,
  }
}

/**
 * The line about the last write, for the selected parameter.
 *
 * @param writing whether a write is under way
 * @param last how the last write went
 * @param id the selected parameter
 * @returns the line, or null if there is nothing to say about this parameter
 */
export function writeNotice(writing: boolean, last: WriteStatus | null, id: string): WriteNotice | null {
  if (writing) {
    return { tone: '', text: 'Writing… waiting for the vehicle to report the new value.' }
  }

  return last?.id === id ? outcomeOf(last) : null
}

/**
 * What the metadata line says when the last file loaded.
 *
 * @param count how many parameters the loaded metadata describes
 * @returns the text, or an empty string without metadata
 */
export function metadataText(count: number): string {
  return count > 0 ? `Metadata for ${count} parameters` : ''
}
