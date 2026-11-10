// What the list of staged changes says, from plain values (no DOM). The words come from the translations.
import type { Translate } from './telemetryCards'
import type { StagedChange, StagedResult } from './useStaged'

/** One line about a staged change that was written. */
export interface StagedLine {
  /** How it looks. */
  tone: 'ok' | 'error'
  /** What it says. */
  text: string
}

/** One row of the list. */
export interface StagedRow {
  /** The change. */
  change: StagedChange
  /** How its write went, once it was written. */
  result: StagedResult | undefined
  /** The words for it: a check and the value read back, or a cross and why not. */
  line: StagedLine | null
  /** Whether it can still be taken out (it has not been read back, and nothing is being written). */
  discardable: boolean
}

/**
 * The line for a written change.
 *
 * @param result how its write went
 * @param translate looks up a message
 * @returns the line
 */
function lineOf(result: StagedResult, translate: Translate): StagedLine {
  return result.outcome === 'verified'
    ? { tone: 'ok', text: translate('staged.verified', { detail: result.detail }) }
    : { tone: 'error', text: translate('staged.notVerified', { detail: result.detail }) }
}

/**
 * The rows of the list.
 *
 * @param changes the staged changes
 * @param results how the written ones went
 * @param writing whether the writes are under way
 * @param translate looks up a message
 * @returns a row for each change
 */
export function linesFor(changes: StagedChange[], results: StagedResult[], writing: boolean, translate: Translate): StagedRow[] {
  return changes.map(change => {
    const result = results.find(candidate => candidate.id === change.id)

    return {
      change,
      result,
      line: result ? lineOf(result, translate) : null,
      discardable: !writing && result?.outcome !== 'verified',
    }
  })
}

/** What the list says under it: politely while writing and when all went well, at once when it stopped. */
export interface StagedSummary {
  /** The polite line (empty: nothing to say). */
  polite: string
  /** The urgent line (empty: nothing to say). */
  urgent: string
}

/**
 * What the list says about the writing.
 *
 * @param changes the staged changes
 * @param results how the written ones went
 * @param writing whether the writes are under way
 * @param translate looks up a message
 * @returns the lines
 */
export function summaryOf(
  changes: StagedChange[],
  results: StagedResult[],
  writing: boolean,
  translate: Translate,
): StagedSummary {
  if (writing) {
    return { polite: translate('staged.writing'), urgent: '' }
  }
  if (results.length === 0) {
    return { polite: '', urgent: '' }
  }
  const stopped = results.some(result => result.outcome !== 'verified')

  return stopped
    ? { polite: '', urgent: translate('staged.stopped') }
    : { polite: translate('staged.allWritten', { count: changes.length }), urgent: '' }
}
