// What the snapshot import panel says and allows, from plain values (no DOM). Vue's templates escape the text; the
// words come from the translations.
import type { State } from './configurator'
import type { Translate } from './telemetryCards'

/** One line about a change that has been applied. */
export interface AppliedLine {
  /** The CSS class of the line. */
  tone: 'ok' | 'warn' | 'error'
  /** What it says. */
  text: string
}

/** How an applied change looks, by how it went. */
const TONES: Record<State['applied'][number]['outcome'], AppliedLine['tone']> = {
  verified: 'ok',
  changed: 'warn',
  failed: 'error',
}

/**
 * The line for one change that has been applied.
 *
 * @param applied how the change went
 * @param translate looks up a message
 * @returns the line to show
 */
export function appliedLine(applied: State['applied'][number], translate: Translate): AppliedLine {
  const { id, outcome, detail } = applied
  const key = outcome === 'verified' ? 'import.written' : 'import.result'

  return { tone: TONES[outcome], text: translate(key, { id, detail }) }
}

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
