// Keys for the end-to-end specs that use the command palette: the chord through DevTools as the host receives it, and opening the
// palette with Ctrl+P so that a key that goes out before the page is ready, or is lost, is pressed again, and a failure says what
// the page was doing (who had the focus, which dialogs and toasts were up) instead of only "still not true after 10000 ms".
import type { E2eApp } from './launch'

/** DevTools modifier bit for Ctrl. */
export const CTRL = 2

/** The virtual key codes of the keys the specs press. */
const CODES: Record<string, [number, string]> = { p: [80, 'KeyP'], Escape: [27, 'Escape'], Enter: [13, 'Enter'] }

/** How long a press of Ctrl+P is given to open the palette before it is pressed again, and how many presses there are. */
const OPEN_WAIT_MS = 2000
const PRESSES = 3

/** The palette's search box, once it is open. */
const OPEN = `document.querySelector('#palette-input') !== null`

/** What the page was doing: for the failure message. */
const SITUATION = `JSON.stringify({
  focused: document.hasFocus(),
  active: [document.activeElement?.tagName, document.activeElement?.id, document.activeElement?.className].join(' '),
  dialogs: [...document.querySelectorAll('dialog[open]')].map(d => d.id || d.className),
  toasts: [...document.querySelectorAll('[role="status"], [role="alert"], .toast')]
    .map(t => t.textContent?.trim()).filter(Boolean),
  hash: location.hash,
  ready: document.readyState,
})`

/**
 * Presses a key, with the modifiers, as the host receives it.
 *
 * @param app the running app
 * @param key the key: `p`, `Escape` or `Enter`
 * @param modifiers the DevTools modifier bits
 */
export async function chord(app: E2eApp, key: string, modifiers = 0): Promise<void> {
  const [code, name] = CODES[key] as [number, string]
  const event = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key, code: name, modifiers }
  await app.devtools('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
  await app.devtools('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

/**
 * Waits until the page has painted what the keys need: the document is loaded and two frames have been drawn, so that the
 * window's key listener (made when the shell is mounted) is there before the first key goes out.
 *
 * @param app the running app
 */
export async function pageIsReady(app: E2eApp): Promise<void> {
  await app.waitFor(`document.readyState === 'complete' && document.querySelector('#connection') !== null`)
  await app.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
}

/**
 * Whether the palette opens within a time.
 *
 * @param app the running app
 * @param ms how long to wait
 * @returns true when its search box is there
 */
async function opensWithin(app: E2eApp, ms: number): Promise<boolean> {
  try {
    await app.waitFor(OPEN, ms)

    return true
  } catch {
    return false
  }
}

/**
 * How a press went: the palette opened in time, opened late (after the wait, but before it was looked at again), or is not open.
 *
 * @param app the running app
 * @returns what happened
 */
async function outcome(app: E2eApp): Promise<'opened' | 'late' | 'closed'> {
  if (await opensWithin(app, OPEN_WAIT_MS)) {
    return 'opened'
  }

  return await app.evaluate<boolean>(OPEN) ? 'late' : 'closed'
}

/**
 * Says in the run's log that a press went otherwise than the first one that opened the palette at once, so that it is seen.
 *
 * @param result how the press went
 * @param number which press it was
 */
function say(result: 'opened' | 'late', number: number): void {
  if (result === 'late') {
    console.warn(`palette-keys: the palette opened late, more than ${OPEN_WAIT_MS} ms after press ${number}`)
  } else if (number > 1) {
    console.warn(`palette-keys: the palette opened on press ${number} of ${PRESSES}: the earlier one(s) were lost`)
  }
}

/**
 * Presses Ctrl+P, number `number` of at most three. Ctrl+P TOGGLES the palette, so a press is made again only when the palette is
 * still not open right before it (a palette that opened late must not be closed by the next press); a palette that opened on a
 * press after the first, or late, is said in the run's log, so that it is seen.
 *
 * @param app the running app
 * @param number which press this is, from 1
 * @throws {Error} when no press opened the palette
 */
async function press(app: E2eApp, number: number): Promise<void> {
  await chord(app, 'p', CTRL)
  const result = await outcome(app)

  if (result !== 'closed') {
    say(result, number)
  } else if (number < PRESSES) {
    await press(app, number + 1)
  } else {
    const situation = await app.evaluate<string>(SITUATION).catch(() => '(unreadable)')
    throw new Error(`Ctrl+P did not open the palette in ${PRESSES} presses, ${OPEN_WAIT_MS} ms each. The page: ${situation}`)
  }
}

/**
 * Opens the palette with Ctrl+P, once the page is ready. A press that does not open it within two seconds is made again (the
 * key can go out before the window has the focus, or while something else has it), up to three presses; then it fails, saying
 * what the page was doing.
 *
 * @param app the running app
 * @throws {Error} when the palette did not open
 */
export async function openPalette(app: E2eApp): Promise<void> {
  await pageIsReady(app)
  await press(app, 1)
}
