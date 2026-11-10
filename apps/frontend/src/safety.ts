// How dangerous actions are confirmed. One place for the constants, so that changing how long a button is held is a
// one-line change (and the PR that does it can say why).
//
// The design has four ways, by how much is at stake, and never a typed word: a hold (arming, disarming, an emergency
// stop: HoldButton), a second press (erasing data, commands to a whole group: SecondPress), a tick (a bench test that
// spins something: TickUnlock), and, for a parameter write, a plain confirmation (this dialog, `plain`) because the
// vehicle's read-back, not the effort of the press, is what makes a write safe.

/** How long the confirm button of a `hold` confirmation is held, in milliseconds. */
export const HOLD_MS = 1200

/** How long after a confirmation appears it ignores presses, so a click meant for what was under it cannot confirm. */
export const IGNORE_MS = 400

/** How long a second-press button waits for its second press before it goes back (ms). */
export const SECOND_PRESS_MS = 5000

/** What a confirmation asks of the user. */
export interface SafetyOptions {
  /** The heading. */
  title: string
  /** What will happen, in words. */
  what: string
  /** The vehicle it will happen to, as the status bar says it (empty when none is connected). */
  vehicle: string
  /** `hold`: hold the button for `HOLD_MS`. `plain`: press the button (a write that the vehicle reads back). */
  level: 'hold' | 'plain'
  /** The words on the confirm button. */
  confirmLabel: string
  /** The colour of a hold: amber for what changes how the vehicle flies, red for what cannot be undone. */
  tone?: 'warn' | 'error'
}
