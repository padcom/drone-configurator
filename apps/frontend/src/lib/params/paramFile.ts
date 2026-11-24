// ArduPilot's plain-text parameter files: reading the three formats the common tools write, and writing each of them. Plain
// values in and out (no DOM, no words for people: what is wrong with a file is data, put into words where it is shown), so
// that a comparison with a file or with the defaults (#40), a frame preset (#41) and a restore from a log (#203) can use them.
//
// Built from the formats as ArduPilot reads and writes them (clean room, no ground station's code):
//
// 1. `NAME,VALUE` or `NAME VALUE` (`.param`, `.parm`). ArduPilot reads it for its defaults files in
//    `AP_Param::parse_param_line` (libraries/AP_Param/AP_Param.cpp): a line that starts with `#` is a comment, the name and the
//    value are split by any of `, =\t\r\n`, a name is at most 16 characters (AP_MAX_NAME_SIZE in AP_Param.h), and a third
//    word `@READONLY` marks the value as one the vehicle may not change. The files of ArduPilot's own Tools/Frame_params are
//    `NAME,VALUE` with CRLF line ends and `#NOTE:` comments; Tools/autotest/default_params are `NAME VALUE`, aligned with
//    spaces or tabs, some with `NAME = VALUE`.
// 2. MAVProxy's `param save` (pymavlink's mavparm.py, `save`): `%-16.16s %f` for a float (the name padded to 16, six
//    decimals) and `%-16.16s %s` otherwise, sorted by name; its `load` drops what follows a `#` anywhere on a line, takes a
//    comma as a space, wants exactly two words, and reads a `0x` value as hexadecimal.
// 3. QGroundControl's `.params`: `#` comment lines, then one line per parameter with the vehicle id, the component id, the
//    name, the value and the type (MAV_PARAM_TYPE, https://mavlink.io/en/messages/common.html#MAV_PARAM_TYPE), tab separated.
//    ArduPilot's Tools/scripts/convert_param_scale.py describes it as "SYSID COMPID NAME VALUE TYPE", tab or space separated.
//
// Reading is per line, so a file may mix them: anything after a `#` is a comment (a value never has one), a byte-order mark
// and CR, LF or CRLF line ends are all taken. A line that is none of them is reported with its number, not dropped in
// silence, and a name that is in the file more than once is reported too: the last one is used, as ArduPilot does when it
// reads such a file. Writing gives the shortest text that reads back as the same number (`showNumber`: 0.1, not MAVProxy's
// 0.100000 or the 0.10000000149011612 of the wire), LF line ends, and the names sorted.
import type { Param, VehicleInfo } from '@/generated/app'
import { showNumber } from './paramValue'

/** The format of a parameter file: `NAME,VALUE` (`.param`), MAVProxy's `NAME VALUE` (`.parm`), QGroundControl's (`.params`). */
export type ParamFileFormat = 'param' | 'parm' | 'qgc'

/** The formats a file can be written in, in the order they are offered. */
export const PARAM_FILE_FORMATS: readonly ParamFileFormat[] = ['param', 'parm', 'qgc']

/** The file name extension of each format. */
export const EXTENSIONS: Record<ParamFileFormat, string> = { param: '.param', parm: '.parm', qgc: '.params' }

/** The longest name ArduPilot takes (AP_MAX_NAME_SIZE). */
export const MAX_NAME = 16

/** MAV_PARAM_TYPE (MAVLink's common.xml): the number of each type name the backend gives. */
export const MAV_PARAM_TYPES: Record<string, number> = {
  UINT8: 1, INT8: 2, UINT16: 3, INT16: 4, UINT32: 5, INT32: 6, UINT64: 7, INT64: 8, REAL32: 9, REAL64: 10,
}

/** One parameter of a file. */
export interface ParamFileEntry {
  /** The name, as written. */
  id: string
  /** The value. */
  value: number
  /** The line it is on (from 1); for a name that is there more than once, the last line. */
  line: number
  /** The vehicle id of a QGroundControl line. */
  sysid?: number
  /** The component id of a QGroundControl line. */
  compid?: number
  /** The type of a QGroundControl line (INT8, REAL32 and so on), when its number is one MAVLink names. */
  type?: string
  /** Marked `@READONLY` (ArduPilot's defaults files). */
  readOnly?: boolean
}

/** A name that is in the file more than once. */
export interface DuplicateName {
  /** The name. */
  id: string
  /** The lines it is on (from 1), in order: the last one is used. */
  lines: number[]
}

/** A line that is not a parameter, a comment or empty. */
export interface MalformedLine {
  /** Its number (from 1). */
  line: number
  /** What it says (trimmed). */
  text: string
}

/** A parameter file, read. */
export interface ParamFile {
  /** The format it is in: QGroundControl's if any line is, else `param` if any line has a comma, else `parm`. */
  format: ParamFileFormat
  /** The parameters, each name once, in the order they first appear. */
  entries: ParamFileEntry[]
  /** The names that are there more than once. */
  duplicates: DuplicateName[]
  /** The lines that are not parameters. */
  malformed: MalformedLine[]
}

/** A name as ArduPilot has them: a letter, then letters, digits and underscores, at most 16 in all. */
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,15}$/u

/** A decimal number, with or without a point and an exponent. */
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u

/** A hexadecimal number (MAVProxy reads `0x` values). */
const HEX = /^[+-]?0[xX][0-9A-Fa-f]+$/u

/** A whole number without a sign (the ids and the type of a QGroundControl line). */
const WHOLE = /^\d+$/u

/** What splits the words of a line: what ArduPilot splits on (`, =\t`), and any other white space. */
const SEPARATORS = /[\s,=]+/u

/** The flag of a value the vehicle may not change, in ArduPilot's defaults files. */
const READ_ONLY_FLAG = '@READONLY'

/**
 * A hexadecimal value as a number.
 *
 * @param text the value as written (`0x…`, perhaps with a sign)
 * @returns the number
 */
function hexValue(text: string): number {
  const sign = text.startsWith('-') ? -1 : 1

  return Number.parseInt(text.replace(/^[+-]/u, ''), 16) * sign
}

/**
 * A value as a number.
 *
 * @param text the value as written
 * @returns the number, or null when it is not one (or not finite)
 */
export function parseValue(text: string): number | null {
  const n = HEX.test(text) ? hexValue(text) : Number(DECIMAL.test(text) ? text : Number.NaN)

  return Number.isFinite(n) ? n : null
}

/**
 * The type name of a MAV_PARAM_TYPE number.
 *
 * @param n the number
 * @returns the name, or undefined for a number MAVLink does not name
 */
function typeName(n: number): string | undefined {
  return Object.keys(MAV_PARAM_TYPES).find(name => MAV_PARAM_TYPES[name] === n)
}

/** A parameter of a line, before its line number is known. */
type LineEntry = Omit<ParamFileEntry, 'line'>

/** What one line is. */
type LineReading = { kind: 'blank' } | { kind: 'malformed' } | { kind: 'entry', entry: LineEntry, qgc: boolean }

const BLANK: LineReading = { kind: 'blank' }
const MALFORMED: LineReading = { kind: 'malformed' }

/**
 * A name and a value as an entry.
 *
 * @param id the name
 * @param valueText the value as written
 * @returns the entry's fields, or null when either is not what it should be
 */
function entryOf(id: string, valueText: string): LineEntry | null {
  const value = parseValue(valueText)

  return NAME.test(id) && value !== null ? { id, value } : null
}

/**
 * Whether five words are a QGroundControl line: whole numbers for the ids and the type.
 *
 * @param words the words of the line
 * @returns true if they are
 */
const isQgcShape = (words: string[]) => words.length === 5 && [0, 1, 4].every(at => WHOLE.test(String(words[at])))

/**
 * The fields of a QGroundControl line besides its name and value: the ids, and the type when MAVLink names its number.
 *
 * @param words the five words of the line
 * @returns the fields
 */
function qgcFields(words: string[]): Pick<ParamFileEntry, 'sysid' | 'compid' | 'type'> {
  const type = typeName(Number(words[4]))

  return { sysid: Number(words[0]), compid: Number(words[1]), ...(type ? { type } : {}) }
}

/**
 * What a line is, from its entry.
 *
 * @param entry the entry, or null when its name or value is not what it should be
 * @param qgc whether it is a QGroundControl line
 * @returns the reading
 */
const readingOf = (entry: LineEntry | null, qgc: boolean): LineReading => (entry ? { kind: 'entry', entry, qgc } : MALFORMED)

/**
 * A QGroundControl line.
 *
 * @param words its five words
 * @returns what it is
 */
function qgcLine(words: string[]): LineReading {
  const entry = entryOf(String(words[2]), String(words[3]))

  return readingOf(entry && { ...entry, ...qgcFields(words) }, true)
}

/**
 * What a `NAME VALUE` line is, from its entry and its flag.
 *
 * @param entry the entry, or null when its name or value is not what it should be
 * @param readOnly whether the line has `@READONLY` after the value
 * @returns the reading
 */
function flagged(entry: LineEntry | null, readOnly: boolean): LineReading {
  return readingOf(entry && readOnly ? { ...entry, readOnly } : entry, false)
}

/**
 * A `NAME VALUE` line, perhaps with ArduPilot's `@READONLY` after it.
 *
 * @param words its words
 * @returns what it is
 */
function pairLine(words: string[]): LineReading {
  const readOnly = words.length === 3 && words[2] === READ_ONLY_FLAG
  const pair = readOnly ? words.slice(0, 2) : words

  return pair.length === 2 ? flagged(entryOf(String(pair[0]), String(pair[1])), readOnly) : MALFORMED
}

/**
 * What one line of a file is.
 *
 * @param body the line, without its comment
 * @returns blank, a parameter, or malformed
 */
function readLine(body: string): LineReading {
  const words = body.trim().split(SEPARATORS).filter(word => word !== '')
  if (words.length === 0) {
    return BLANK
  }

  return isQgcShape(words) ? qgcLine(words) : pairLine(words)
}

/** What has been read so far. */
interface Reading {
  /** The entries, by name, in the order they first appeared. */
  byId: Map<string, ParamFileEntry>
  /** The lines of each name. */
  lines: Map<string, number[]>
  /** The lines that are not parameters. */
  malformed: MalformedLine[]
  /** Whether a QGroundControl line was read. */
  qgc: boolean
  /** Whether a parameter line had a comma. */
  comma: boolean
}

/**
 * Notes what kind of line a parameter line is: QGroundControl's, or one with a comma.
 *
 * @param reading what has been read so far
 * @param qgc whether it is a QGroundControl line
 * @param body the line, without its comment
 */
function noteKind(reading: Reading, qgc: boolean, body: string): void {
  reading.qgc ||= qgc
  reading.comma ||= !qgc && body.includes(',')
}

/**
 * Takes in one parameter line.
 *
 * @param reading what has been read so far
 * @param read the line's entry, and whether it is a QGroundControl line
 * @param read.entry the entry
 * @param read.qgc whether it is a QGroundControl line
 * @param line its number (from 1)
 * @param body the line, without its comment
 */
function addEntry(reading: Reading, read: { entry: LineEntry, qgc: boolean }, line: number, body: string): void {
  const { id } = read.entry
  reading.byId.set(id, { ...read.entry, line })
  reading.lines.set(id, [...reading.lines.get(id) ?? [], line])
  noteKind(reading, read.qgc, body)
}

/**
 * Takes in one line.
 *
 * @param reading what has been read so far
 * @param raw the line as it is in the file
 * @param index its index (from 0)
 */
function takeLine(reading: Reading, raw: string, index: number): void {
  // Anything after a `#` is a comment: at the start of a line (ArduPilot), or after the value (MAVProxy).
  const body = raw.split('#')[0] ?? ''
  const read = readLine(body)
  if (read.kind === 'malformed') {
    reading.malformed.push({ line: index + 1, text: raw.trim() })
  } else if (read.kind === 'entry') {
    addEntry(reading, read, index + 1, body)
  }
}

/**
 * The format a file is in, from what its lines were.
 *
 * @param reading what was read
 * @returns the format
 */
function formatOf(reading: Reading): ParamFileFormat {
  if (reading.qgc) {
    return 'qgc'
  }

  return reading.comma ? 'param' : 'parm'
}

/**
 * The lines of a text, whatever its line ends: CRLF (Windows, and ArduPilot's own Frame_params), LF, or CR alone.
 *
 * @param text the text
 * @returns its lines
 */
export const linesOf = (text: string): string[] => text.replace(/^\uFEFF/u, '').split(/\r\n|\r|\n/u)

/**
 * Reads a parameter file in any of the three formats.
 *
 * @param text the file's text
 * @returns what it holds; a file with no parameter lines has no entries (the caller says why that is not a parameter file)
 */
export function parseParamFile(text: string): ParamFile {
  const reading: Reading = { byId: new Map(), lines: new Map(), malformed: [], qgc: false, comma: false }
  linesOf(text).forEach((raw, index) => takeLine(reading, raw, index))
  const duplicates = [...reading.lines].filter(([, lines]) => lines.length > 1).map(([id, lines]) => ({ id, lines }))

  return { format: formatOf(reading), entries: [...reading.byId.values()], duplicates, malformed: reading.malformed }
}

/**
 * Whether a text is JSON (an object) rather than a plain-text parameter file: what a snapshot is.
 *
 * @param text the file's text
 * @returns true if its first character that is not white space is `{`
 */
export const looksLikeJson = (text: string): boolean => text.replace(/^\uFEFF/u, '').trimStart().startsWith('{')

/** What writing a file needs to know of the vehicle. */
export interface FileOptions {
  /** The vehicle the parameters are from, if known (its ids go into a QGroundControl file; 1 and 1 without one). */
  vehicle?: VehicleInfo
  /** When it was saved (for the comment at the top). */
  now?: Date
}

/**
 * The parameters sorted by name, as the tools write them (by character code, the same everywhere).
 *
 * @param params the parameters
 * @returns a sorted copy
 */
const byName = (params: Param[]) => [...params].sort((a, b) => (a.id < b.id ? -1 : Number(a.id > b.id)))

/**
 * The comment at the top of a file: what the parameters are of, and when they were saved.
 *
 * @param options the vehicle and the time
 * @returns the comment lines
 */
function header(options: FileOptions): string[] {
  const { vehicle, now = new Date() } = options
  const who = vehicle ? `${vehicle.type} (${vehicle.autopilot}), vehicle ${vehicle.sysid}` : 'a vehicle'

  return [`# Parameters of ${who}, saved by Drone Configurator on ${now.toISOString()}`]
}

/**
 * The MAV_PARAM_TYPE number of a parameter.
 *
 * @param param the parameter
 * @returns the number of its type; a type the table lacks is taken as INT32 or REAL32, by its kind
 */
const typeNumber = (param: Param) => MAV_PARAM_TYPES[param.type] ?? (param.kind === 'int' ? 6 : 9)

/**
 * The lines of a QGroundControl file.
 *
 * @param params the parameters, sorted
 * @param options the vehicle and the time
 * @returns the lines
 */
function qgcLines(params: Param[], options: FileOptions): string[] {
  const { sysid, compid } = options.vehicle ?? { sysid: 1, compid: 1 }
  const top = [...header(options), '#', '# Vehicle-Id Component-Id Name Value Type']

  return [...top, ...params.map(p => [sysid, compid, p.id, showNumber(p.value), typeNumber(p)].join('\t'))]
}

/**
 * Writes parameters as a file.
 *
 * @param params the parameters
 * @param format the format
 * @param options the vehicle they are from and the time
 * @returns the file's text (LF line ends, and one at the end)
 */
export function formatParamFile(params: Param[], format: ParamFileFormat, options: FileOptions = {}): string {
  const sorted = byName(params)
  const lines = {
    param: () => [...header(options), ...sorted.map(p => `${p.id},${showNumber(p.value)}`)],
    parm: () => [...header(options), ...sorted.map(p => `${p.id.padEnd(MAX_NAME)} ${showNumber(p.value)}`)],
    qgc: () => qgcLines(sorted, options),
  }[format]()

  return `${lines.join('\n')}\n`
}
