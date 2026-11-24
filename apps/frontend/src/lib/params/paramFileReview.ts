// A parameter file (`.param`, `.parm`, `.params`) under review: the same review as a snapshot's, with what the file has that is
// not a change said in notes (a name more than once, a line that is not a parameter). Nothing here writes.
import { say } from '@/i18n/say'
import type { Param, VehicleInfo } from '@/generated/app'
import { type DiffOptions, type WantedValue, diffValues } from './paramDiff'
import type { DuplicateName, ParamFile, ParamFileEntry } from './paramFile'
import type { Review } from './snapshot'

/** How many lines that are not parameters are listed one by one; the rest are counted. */
export const MALFORMED_LISTED = 5

/**
 * Why a line of a QGroundControl file is not applied: it is for another component of the vehicle (a gimbal, a camera).
 *
 * @param entry the line's parameter
 * @param vehicle the connected vehicle
 * @returns the problem, or undefined
 */
function componentProblem(entry: ParamFileEntry, vehicle: VehicleInfo | undefined): string | undefined {
  if (entry.compid === undefined || !vehicle || entry.compid === vehicle.compid) {
    return undefined
  }

  return say('problem.otherComponent', { file: entry.compid, vehicle: vehicle.compid })
}

/**
 * The value a line wants. The type of a QGroundControl line is not held against the vehicle's: the value is what counts, and it
 * is checked against the vehicle's type (a firmware that widened a parameter still takes the value).
 *
 * @param entry the line's parameter
 * @param vehicle the connected vehicle
 * @returns the wanted value
 */
function wantedOf(entry: ParamFileEntry, vehicle: VehicleInfo | undefined): WantedValue {
  const problem = componentProblem(entry, vehicle)

  return { id: entry.id, value: entry.value, ...(problem === undefined ? {} : { problem }) }
}

/**
 * The notes of the lines that are not parameters: the first few with their numbers, then how many more.
 *
 * @param file the file
 * @returns the notes
 */
function malformedNotes(file: ParamFile): string[] {
  const listed = file.malformed.slice(0, MALFORMED_LISTED).map(({ line, text }) => say('import.note.malformed', { line, text }))
  const more = file.malformed.length - listed.length

  return more > 0 ? [...listed, say('import.note.moreMalformed', { count: more }, more)] : listed
}

/**
 * The note of a name that is in the file more than once.
 *
 * @param duplicate the name and its lines
 * @returns the note
 */
function duplicateNote(duplicate: DuplicateName): string {
  const { id, lines } = duplicate

  return say('import.note.duplicate', { id, lines: lines.join(', '), last: lines.at(-1) })
}

/**
 * What the file has that is not a change.
 *
 * @param file the file
 * @returns the notes: names in it more than once, then lines that are not parameters
 */
export function fileNotes(file: ParamFile): string[] {
  return [...file.duplicates.map(duplicateNote), ...malformedNotes(file)]
}

/**
 * What loading a parameter file would change on a vehicle with `params`. A name the vehicle does not have is a change that
 * cannot be made ("not on this vehicle"), not left out.
 *
 * @param file the file, read
 * @param params the vehicle's parameters now
 * @param vehicle the connected vehicle
 * @param options the metadata, if loaded
 * @returns the review
 */
export function reviewFile(
  file: ParamFile,
  params: Param[],
  vehicle: VehicleInfo | undefined,
  options: DiffOptions = {},
): Review {
  const wanted = file.entries.map(entry => wantedOf(entry, vehicle))

  return {
    source: { kind: 'file', format: file.format },
    ...diffValues(wanted, params, options),
    vehicleWarning: null,
    notes: fileNotes(file),
  }
}
