// The message browser and the export of the mock's logs (the contract's `logs.local.messages`, `.at` and `.export`): four kinds
// of message (ATT with a unit, BAT with two instances, MSG with a text, ISBD with arrays), the fields of a kind at a time, and an
// export that never replaces a file unless it is asked a second time with the file's name. The rules are the backend's.
import type { AtField, AtRow, LocalLogAt, LocalLogExported, LocalLogMessages, MessageField, MessageType } from '@/generated/app'

/** A signal of the mock flight: its value at a time (seconds from the start of the log), or null where there is none. */
export type Signal = (seconds: number) => number | null

/**
 * A field that is a number.
 *
 * @param name its name
 * @param unit the unit the log names for it, if it names one
 * @returns the field
 */
function numberField(name: string, unit?: string): MessageField {
  return unit === undefined ? { name, kind: 'number' } : { name, unit, kind: 'number' }
}

/** The kinds of message of the mock flights. */
export const MOCK_TYPES: MessageType[] = [
  { name: 'ATT', count: 12_000, fields: [numberField('TimeUS'), numberField('Roll', 'deg'), numberField('Pitch', 'deg')] },
  {
    name: 'BAT',
    count: 2400,
    fields: [numberField('TimeUS'), numberField('Inst'), numberField('Volt', 'V')],
    instanceField: 'Inst',
  },
  { name: 'ISBD', count: 400, fields: [numberField('TimeUS'), { name: 'x', kind: 'array' }] },
  { name: 'MSG', count: 12, fields: [numberField('TimeUS'), { name: 'Message', kind: 'text' }] },
]

/** The kinds the answer lists. */
export const MOCK_MESSAGES: LocalLogMessages = { types: MOCK_TYPES }

/** Where and when a row is asked for. */
interface Place {
  signals: Readonly<Record<string, Signal>>
  message: string
  instance: number | undefined
  timeUs: number
}

/** The fields that are not a signal: the time of the message, and the instance. */
const FIXED: Readonly<Record<string, (place: Place) => number>> = {
  TimeUS: place => place.timeUs,
  Inst: place => place.instance ?? 0,
}

/**
 * How far a field of the second instance is above the first's: the second battery is 4 V above it.
 *
 * @param name the field
 * @param place where and when
 * @returns the shift
 */
function shiftOf(name: string, place: Place): number {
  return place.instance === 1 && name === 'Volt' ? 4 : 0
}

/**
 * The value of a signal at a place; the second battery is 4 V above the first.
 *
 * @param name the field
 * @param place where and when
 * @returns the value, or null/undefined where there is none
 */
function signalAt(name: string, place: Place): number | null | undefined {
  const value = place.signals[`${place.message}.${name}`]?.((place.timeUs - 1_000_000) / 1e6)

  return typeof value === 'number' ? value + shiftOf(name, place) : value
}

/**
 * One number field of a row: its value, or no value where the signal has none.
 *
 * @param field the field
 * @param place where and when
 * @returns the field of the row
 */
function numberAt(field: MessageField, place: Place): AtField {
  const value = FIXED[field.name]?.(place) ?? signalAt(field.name, place)

  return typeof value === 'number' ? { name: field.name, value } : { name: field.name }
}

/**
 * The row of a kind for one instance at a time (an array field is not in it).
 *
 * @param place where and when
 * @returns the row
 */
function rowOf(place: Place): AtRow {
  const type = MOCK_TYPES.find(candidate => candidate.name === place.message)
  const fields = (type?.fields ?? [])
    .filter(field => field.kind !== 'array')
    .map(field => (field.kind === 'text' ? { name: field.name, text: 'ArduCopter V4.7.2' } : numberAt(field, place)))

  return { ...place.instance === undefined ? {} : { instance: place.instance }, timeUs: place.timeUs, fields }
}

/**
 * The fields of a kind at a time: the last message of each instance at or before it.
 *
 * @param signals the signals of the mock flight
 * @param ask what is asked
 * @param ask.message the kind
 * @param ask.timeUs the time
 * @param firstUs the time of the first message of the log
 * @returns the answer
 */
export function atAnswer(
  signals: Readonly<Record<string, Signal>>,
  ask: { message: string, timeUs: number },
  firstUs: number,
): LocalLogAt {
  const type = MOCK_TYPES.find(candidate => candidate.name === ask.message)
  if (type === undefined || ask.timeUs < firstUs) {
    return { found: false, rows: [] }
  }
  const instances = type.instanceField === undefined ? [undefined] : [0, 1]

  return { found: true, rows: instances.map(instance => rowOf({ signals, message: ask.message, instance, timeUs: ask.timeUs })) }
}

/** What an export asks. */
export type ExportAsk = {
  /** The log. */
  key: string
  /** The format. */
  format: string
  /** The kind of message, for a CSV. */
  message?: string
  /** The file, in the second request. */
  path?: string
  /** Whether to replace it. */
  overwrite?: boolean
}

/**
 * The file the mock proposes for an export.
 *
 * @param ask the request
 * @returns the path
 */
function proposed(ask: ExportAsk): string {
  const stem = ask.key.slice(-21, -13)
  const kind = ask.format === 'csv' ? `-${ask.message}` : ''

  return `/mock/saved/${stem}${kind}.${ask.format}`
}

/**
 * How many rows the mock writes for a format.
 *
 * @param format the format
 * @returns the rows
 */
function rowsFor(format: ExportAsk['format']): number {
  return format === 'csv' ? 12_000 : 1500
}

/** The files the mock's exports have written (the mock has no disk). */
export class MockSaved {
  readonly files = new Set<string>()

  /**
   * Answers an export: a refusal to replace a file that is there, or the rows written.
   *
   * @param ask the request
   * @returns the answer
   */
  save(ask: ExportAsk): LocalLogExported {
    const path = ask.path ?? proposed(ask)
    if (this.files.has(path) && ask.overwrite !== true) {
      return { path, exists: true, rows: 0, bytes: 0 }
    }
    this.files.add(path)

    return { path, rows: rowsFor(ask.format), bytes: 480_000 }
  }
}
