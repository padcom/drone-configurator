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
 * Opens the palette with Ctrl+P. A press that does not open it within two seconds is made again (the key can go out before the
 * window has the focus, or while something else has it), up to three presses; then it fails, saying what the page was doing.
 *
 * @param app the running app
 * @throws {Error} when the palette did not open
 */
export async function openPalette(app: E2eApp): Promise<void> {
  await pageIsReady(app)

  for (let press = 1; press <= PRESSES; press++) {
    // One press after the other: a second is only made when the first did not open it.
    // eslint-disable-next-line no-await-in-loop
    await chord(app, 'p', CTRL)

    // eslint-disable-next-line no-await-in-loop
    if (await opensWithin(app, OPEN_WAIT_MS)) {
      return
    }
  }
  const situation = await app.evaluate<string>(SITUATION).catch(() => '(unreadable)')
  throw new Error(`Ctrl+P did not open the palette in ${PRESSES} presses. The page: ${situation}`)
}
