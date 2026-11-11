// "Put the focus in the Parameters search box when it is there": a command that goes to the Parameters screen asks for it, and
// the box takes it when it is shown (mounted, or activated again when the screen is kept alive). Nothing polls the page for the
// box, and a screen that is slow to load still gets it. An intent that nobody took (the user went elsewhere) goes stale and is
// ignored, so it never takes the focus later, when the user opens the screen on their own.
import type { FocusTarget } from '@/lib/commands/command'

/** How long an intent that was not taken is still good (ms). */
export const INTENT_MS = 5000

let pending: { target: FocusTarget, at: number } | null = null

/**
 * Asks for the focus to go to `target` once what shows it is there.
 *
 * @param target the place
 * @param now the time (ms)
 */
export function askForFocus(target: FocusTarget, now = Date.now()): void {
  pending = { target, at: now }
}

/**
 * Takes the intent for `target`, if there is a fresh one: it is gone after this.
 *
 * @param target the place that is shown now
 * @param now the time (ms)
 * @returns true when the focus is to go there
 */
export function takeFocus(target: FocusTarget, now = Date.now()): boolean {
  const asked = pending
  if (asked?.target !== target) {
    return false
  }
  pending = null

  return now - asked.at <= INTENT_MS
}
