// "Put the focus there once it is shown": a command that goes to the Parameters screen asks for the focus to be in its search box
// (`params.search`) or in the value editor of a parameter (`params.value`, for the parameter named), and what shows that place
// takes it when it is shown (mounted, activated again when the screen is kept alive, or when what it waits for has happened:
// the parameter is selected). Nothing polls the page, and a screen that is slow to load still gets it. An intent that nobody took
// (the user went elsewhere) goes stale and is ignored, so it never takes the focus later, when the user opens the screen on
// their own.
import { type Ref, shallowRef } from 'vue'
import type { FocusTarget } from '@/lib/commands/command'

/** How long an intent that was not taken is still good (ms). */
export const INTENT_MS = 5000

let pending: { target: FocusTarget, at: number, detail: string } | null = null

/** Counts the asking: a place that waits for something else (a selection) also looks when a new intent is made. */
const asks = shallowRef(0)

/** Changes whenever a focus is asked for (to watch). */
export const focusAsked: Readonly<Ref<number>> = asks

/**
 * Asks for the focus to go to `target` once what shows it is there.
 *
 * @param target the place
 * @param now the time (ms)
 * @param detail what the place needs to know: the parameter, for `params.value`
 */
export function askForFocus(target: FocusTarget, now = Date.now(), detail = ''): void {
  pending = { target, at: now, detail }
  asks.value += 1
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

/**
 * Takes the intent for `target` about `detail` (the parameter a value editor shows), if there is a fresh one for exactly that.
 * One for another detail is left alone: it waits for what it asked for (the selection of that parameter).
 *
 * @param target the place that is shown now
 * @param detail what it shows now (not empty)
 * @param now the time (ms)
 * @returns true when the focus is to go there
 */
export function takeFocusFor(target: FocusTarget, detail: string, now = Date.now()): boolean {
  return pending?.detail === detail && takeFocus(target, now)
}
