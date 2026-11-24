// What the import panel (a snapshot or a parameter file under review) says and allows, from plain values (no DOM). Vue's
// templates escape the text; the words come from the translations.
import type { Change, PresetSource, ReviewSource } from './snapshot'
import type { State } from '@/state/state'
import type { Translate } from '@/lib/fly/telemetryCards'

/**
 * Whether applying stopped early: the last change did not verify, and nothing is being written now.
 *
 * @param applied how each change went, in order
 * @param applying whether a write is under way
 * @returns true if the rest of the ticked changes were not written
 */
export function stoppedEarly(applied: State['applied'], applying: boolean): boolean {
  const last = applied.at(-1)

  return last !== undefined && last.outcome !== 'verified' && !applying
}

/** The result column of one row of the review. */
export interface RowResult {
  /** How it looks: `ok` for a verified write, `error` for one that did not verify, `warn` for a change that cannot be made. */
  tone: 'ok' | 'error' | 'warn' | ''
  /** What it says (empty until there is something to say). */
  text: string
}

/** How far applying has got, for the rows that have not been written. */
export interface Progress {
  /** How the changes written so far went. */
  applied: State['applied']
  /** Whether applying stopped early (the changes not written are then said so). */
  stopped: boolean
  /** Whether this change is ticked. */
  picked: boolean
}

/**
 * The result of a row that has been written.
 *
 * @param written how its write went
 * @param translate looks up a message
 * @returns a check and the value read back, or a cross and why not
 */
function writtenResult(written: State['applied'][number], translate: Translate): RowResult {
  const verified = written.outcome === 'verified'

  return {
    tone: verified ? 'ok' : 'error',
    text: translate(verified ? 'import.verified' : 'import.notVerified', { detail: written.detail }),
  }
}

/**
 * The result of a row with a value the metadata finds unusual (a warning: it can still be ticked), or of one with nothing to say.
 *
 * @param warning what the metadata finds unusual, or null
 * @param translate looks up a message
 * @returns the result
 */
function warningResult(warning: string | null, translate: Translate): RowResult {
  return warning ? { tone: 'warn', text: translate('import.unusual', { warning }) } : { tone: '', text: '' }
}

/**
 * The result of a row that has not been written: why it cannot be made, that applying stopped before it, what the metadata finds
 * unusual about the value, or nothing.
 *
 * @param change the row's change
 * @param progress how far applying has got
 * @param translate looks up a message
 * @returns the result
 */
function unwrittenResult(change: Change, progress: Progress, translate: Translate): RowResult {
  if (change.problem) {
    return { tone: 'warn', text: change.problem }
  }
  if (progress.stopped && progress.picked) {
    return { tone: '', text: translate('import.notWritten') }
  }

  return warningResult(change.warning, translate)
}

/**
 * What the result column of a row says.
 *
 * @param change the row's change
 * @param progress how far applying has got
 * @param translate looks up a message
 * @returns the result: how its write went, why it cannot be made, that it was not written, or nothing
 */
export function resultOf(change: Change, progress: Progress, translate: Translate): RowResult {
  const written = progress.applied.find(line => line.id === change.id)

  return written ? writtenResult(written, translate) : unwrittenResult(change, progress, translate)
}

/** The line above the buttons: what is ticked, what is going on, or how it ended. */
export interface ReviewStatus {
  /** How it looks. */
  tone: 'ok' | 'warn' | ''
  /** What it says. */
  text: string
}

/**
 * What the line says before anything was written: that nothing is written while the vehicle may be armed, how many are ticked,
 * or to tick some.
 *
 * @param count how many changes are ticked
 * @param armed whether the vehicle is armed or may be
 * @param translate looks up a message
 * @returns the line
 */
function beforeWriting(count: number, armed: boolean, translate: Translate): ReviewStatus {
  if (armed) {
    return { tone: 'warn', text: translate('import.armed') }
  }

  return { tone: '', text: count > 0 ? translate('import.ready', { count }) : translate('import.tick') }
}

/** What the line above the buttons depends on. */
export type StatusState = Pick<State, 'picked' | 'applied' | 'applying'> & {
  /** Whether the vehicle is armed or may be: nothing is written then. */
  armed?: boolean
}

/**
 * The line above the buttons.
 *
 * @param state what is ticked, what was applied, whether a write is under way, and whether the vehicle may be armed
 * @param translate looks up a message
 * @returns the line
 */
export function statusOf(state: StatusState, translate: Translate): ReviewStatus {
  if (state.applying) {
    return { tone: '', text: translate('import.writing') }
  }
  if (state.applied.length === 0) {
    return beforeWriting(state.picked.length, state.armed === true, translate)
  }

  return stoppedEarly(state.applied, false)
    ? { tone: 'warn', text: translate('import.stopped') }
    : { tone: 'ok', text: translate('import.allWritten') }
}

/**
 * Whether the panel is shown: a snapshot is under review, or loading one failed.
 *
 * @param review the snapshot under review, if any
 * @param error why the last one could not be loaded, if it could not
 * @returns true to show the panel
 */
export function panelShown(review: State['importReview'], error: string | null): boolean {
  return review !== null || error !== null
}

/**
 * Whether the button that writes the ticked changes does anything now.
 *
 * @param state what is ticked, whether a write is under way, the connection, and whether the vehicle may be armed
 * @returns true when something is ticked, nothing is being written, and the vehicle is connected and known to be disarmed
 */
export function canApply(state: Pick<State, 'picked' | 'applying' | 'connection'> & { armed?: boolean }): boolean {
  return state.picked.length > 0 && !state.applying && state.connection.state === 'connected' && state.armed !== true
}

/** The words of the review that depend on where the values come from. */
export interface SourceWords {
  /** The heading. */
  heading: string
  /** The heading of the column of the wanted values. */
  column: string
}

/**
 * The heading and the column of a frame preset's review (#41): its name, and where it came from.
 *
 * @param source the preset
 * @param translate looks up a message
 * @returns the words
 */
function presetWords(source: PresetSource, translate: Translate): SourceWords {
  const heading = translate('import.fromPreset', { path: source.path, ref: source.ref })

  return { heading, column: translate('import.column.preset') }
}

/**
 * The heading and the column of a review, for a snapshot, a parameter file, the firmware's defaults or a frame preset.
 *
 * @param source where the values come from
 * @param translate looks up a message
 * @returns the words
 */
export function sourceWords(source: ReviewSource, translate: Translate): SourceWords {
  if (source.kind === 'snapshot') {
    return { heading: translate('import.from', { savedAt: source.savedAt }), column: translate('import.column.snapshot') }
  }
  if (source.kind === 'defaults') {
    return { heading: translate('import.fromDefaults'), column: translate('import.column.defaults') }
  }
  if (source.kind === 'preset') {
    return presetWords(source, translate)
  }

  const format = translate(`paramFile.format.${source.format}`)

  return { heading: translate('import.fromFile', { format }), column: translate('import.column.file') }
}
