// What the message browser shows of the backend's answers: the fields of a message with their units, and the words for how an
// export went. Pure functions; a value the log does not have is a dash, never a zero.
import type { AtField, AtRow, MessageType } from '@/generated/app'
import type { ExportState } from '@/composables/useLogBrowser'

/** A field as the table shows it. */
export interface FieldRow {
  /** The field's name. */
  name: string
  /** Its value with its unit, its text, or a dash when the log has no value for it. */
  text: string
  /** Whether a press on it can chart it (a number field). */
  graphable: boolean
}

/** Formats a number. */
type NumberFormat = (value: number, digits?: number) => string

/** Translates. */
type Translate = (key: string, values?: Record<string, unknown>, plural?: number) => string

/**
 * The decimals to show for a value: none for a whole number, else up to four that matter.
 *
 * @param value the number
 * @returns the number of decimals
 */
function digitsOf(value: number): number {
  if (Number.isInteger(value)) {
    return 0
  }
  const magnitude = Math.abs(value)

  if (magnitude >= 1000) {
    return 1
  }

  return magnitude >= 1 ? 3 : 4
}

/**
 * What the table says for one field: its text, its number with the unit, or a dash for a number the log does not have.
 *
 * @param field the field of the message
 * @param unit the unit the log names for it, if it does
 * @param number the number formatter of the interface
 * @returns the words
 */
function valueText(field: AtField, unit: string | undefined, number: NumberFormat): string {
  if (field.text !== undefined) {
    return field.text
  }
  if (field.value === undefined) {
    return '—'
  }
  const shown = number(field.value, digitsOf(field.value))

  return unit === undefined ? shown : `${shown} ${unit}`
}

/**
 * The fields of one message, in the order of the log's format, with the unit the log names for each number.
 *
 * @param row the message (the last of its instance at the place asked for)
 * @param type the kind of message it is
 * @param number the number formatter of the interface
 * @returns the rows of the table
 */
export function fieldRows(row: AtRow, type: MessageType, number: NumberFormat): FieldRow[] {
  return row.fields.map(field => {
    const unit = type.fields.find(candidate => candidate.name === field.name)?.unit

    return { name: field.name, text: valueText(field, unit, number), graphable: field.text === undefined }
  })
}

/**
 * The last part of a path.
 *
 * @param path the path
 * @returns the file name
 */
export function baseNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * What the page says of a file that was written.
 *
 * @param state the export
 * @param t translates
 * @param number the number formatter of the interface
 * @returns the words
 */
function savedWords(state: Extract<ExportState, { kind: 'saved' }>, t: Translate, number: NumberFormat): string {
  return t('logs.export.saved', { name: baseNameOf(state.path), count: number(state.rows, 0) }, state.rows)
}

/**
 * What the page says of an export the log cannot give.
 *
 * @param state the export
 * @param t translates
 * @returns the words
 */
function unavailableWords(state: Extract<ExportState, { kind: 'unavailable' }>, t: Translate): string {
  const key = state.format === 'csv' ? 'logs.export.noKind' : 'logs.export.noTrack'

  return t(key, { format: state.format.toUpperCase() })
}

/**
 * What the page says of an export that has nothing to count or to name a format for.
 *
 * @param state the export
 * @param t translates
 * @returns the words
 */
function otherWords(state: ExportState, t: Translate): string {
  switch (state.kind) {
    case 'cancelled': return t('logs.export.cancelled')
    case 'exists': return t('logs.export.exists', { name: baseNameOf(state.path) })
    case 'failed': return state.text
    default: return ''
  }
}

/**
 * What the page says of an export.
 *
 * @param state how the export stands
 * @param t translates
 * @param number the number formatter of the interface
 * @returns the words ('' when nothing was asked)
 */
export function exportWords(state: ExportState, t: Translate, number: NumberFormat): string {
  if (state.kind === 'saved') {
    return savedWords(state, t, number)
  }

  return state.kind === 'unavailable' ? unavailableWords(state, t) : otherWords(state, t)
}
