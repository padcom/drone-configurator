// How dangerous actions are confirmed. One place for the constants, so that changing how long a button is held is a
// one-line change (and the PR that does it can say why).

/** How long the confirm button of a `hold` confirmation is held, in milliseconds. */
export const HOLD_MS = 1200

/** How long after a confirmation appears it ignores presses, so a click meant for what was under it cannot confirm. */
export const IGNORE_MS = 400

/** What a confirmation asks of the user. */
export interface SafetyOptions {
  /** The heading. */
  title: string
  /** What will happen, in words. */
  what: string
  /** The vehicle it will happen to, as the status bar says it (empty when none is connected). */
  vehicle: string
  /** `hold`: hold the button for `HOLD_MS`. `typed`: type `typedWord`, then press the button. */
  level: 'hold' | 'typed'
  /** The word to type (for `typed`), matched exactly. */
  typedWord?: string
  /** Draws the confirm button as dangerous (what it does is also in the words). */
  danger?: boolean
}

/**
 * Whether what was typed is the word, exactly (case matters, and no space around it is forgiven).
 *
 * @param typed what the user typed
 * @param word the word to type
 * @returns true when they are the same
 */
export function typedMatches(typed: string, word: string | undefined): boolean {
  return word !== undefined && word !== '' && typed === word
}
