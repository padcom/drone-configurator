// What the snapshot import panel says and allows, from plain values (no DOM). Vue's templates escape the text; the
// words come from the translations.
import type { Change } from './snapshot'
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
 * The result of a row that has not been written: why it cannot be made, that applying stopped before it, or nothing.
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

  return { tone: '', text: progress.stopped && progress.picked ? translate('import.notWritten') : '' }
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
 * What the line says before anything was written: how many are ticked, or to tick some.
 *
 * @param count how many changes are ticked
 * @param translate looks up a message
 * @returns the line
 */
function beforeWriting(count: number, translate: Translate): ReviewStatus {
  return { tone: '', text: count > 0 ? translate('import.ready', { count }) : translate('import.tick') }
}

/**
 * The line above the buttons.
 *
 * @param state what is ticked, what was applied, and whether a write is under way
 * @param translate looks up a message
 * @returns the line
 */
export function statusOf(state: Pick<State, 'picked' | 'applied' | 'applying'>, translate: Translate): ReviewStatus {
  if (state.applying) {
    return { tone: '', text: translate('import.writing') }
  }
  if (state.applied.length === 0) {
    return beforeWriting(state.picked.length, translate)
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
 * @param state what is ticked, whether a write is under way, and the connection
 * @returns true when something is ticked, nothing is being written, and the vehicle is connected
 */
export function canApply(state: Pick<State, 'picked' | 'applying' | 'connection'>): boolean {
  return state.picked.length > 0 && !state.applying && state.connection.state === 'connected'
}
