// The keys of the application, in ONE table: what listens for a key (the command palette) and what shows one (the key hint in
// the top bar and in a row of the palette) read it here. The keys are fixed for now; a user-defined map (#20) replaces the
// contents of this table, and nothing else changes, because listeners ask the table and commands only carry a string.
//
// The table also lists, as documentation and for #20 to take over, the keys that exist today in their own modules (F6 and
// Shift+F6 in paneFocus.ts, Ctrl+/ and Ctrl+Enter in paramShortcuts.ts). They are listened for there, not here: moving them
// is not part of the palette's work. `listens` says which.

/** One key of the table. */
export interface Key {
  /** What it does: `palette.open`. Unique. */
  actionId: string
  /** The physical key (`KeyboardEvent.code`): the same on every layout (on a Russian layout `key` is not "p"). */
  code: string
  /** Whether Ctrl is held (Cmd on a Mac counts as well). */
  ctrl?: boolean
  /** Whether Shift is held. */
  shift?: boolean
  /** How it is shown. */
  label: string
  /** How it is shown on a Mac, when it is not the same. */
  macLabel?: string
  /** `keymap`: `matches` here is what listens for it. `module`: the module that has the behaviour listens (a note here). */
  listens: 'keymap' | 'module'
}

/** The keys. No two have the same code and modifiers (the keymap test checks). */
export const KEYS: readonly Key[] = [
  { actionId: 'palette.open', code: 'KeyP', ctrl: true, label: 'Ctrl P', macLabel: '⌘ P', listens: 'keymap' },
  { actionId: 'panes.next', code: 'F6', label: 'F6', listens: 'module' },
  { actionId: 'panes.previous', code: 'F6', shift: true, label: 'Shift F6', listens: 'module' },
  { actionId: 'params.search', code: 'Slash', ctrl: true, label: 'Ctrl /', macLabel: '⌘ /', listens: 'module' },
  { actionId: 'params.write', code: 'Enter', ctrl: true, label: 'Ctrl Enter', macLabel: '⌘ Enter', listens: 'module' },
]

/**
 * Whether this is a Mac, where Cmd is the modifier people use and the key hints show it.
 *
 * @returns true on macOS
 */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac/iu.test(navigator.platform)
}

/**
 * The key of an action.
 *
 * @param actionId the action
 * @returns its key, or undefined when it has none
 */
export function keyOf(actionId: string): Key | undefined {
  return KEYS.find(key => key.actionId === actionId)
}

/**
 * Whether Ctrl is held (Cmd as well on a Mac).
 *
 * @param event the key press
 * @param mac whether it is a Mac
 * @returns true when it is
 */
function ctrlHeld(event: KeyboardEvent, mac: boolean): boolean {
  return event.ctrlKey || (mac && event.metaKey)
}

/**
 * Whether a modifier that no key of the table uses is held (Alt; Meta off a Mac).
 *
 * @param event the key press
 * @param mac whether it is a Mac
 * @returns true when one is
 */
function strayHeld(event: KeyboardEvent, mac: boolean): boolean {
  return event.altKey || (!mac && event.metaKey)
}

/**
 * The modifiers of a key press as a string: Ctrl, Shift, stray, each 0 or 1.
 *
 * @param event the key press
 * @param mac whether it is a Mac
 * @returns for example "100" for Ctrl alone
 */
function held(event: KeyboardEvent, mac: boolean): string {
  return `${Number(ctrlHeld(event, mac))}${Number(event.shiftKey)}${Number(strayHeld(event, mac))}`
}

/**
 * The modifiers a key of the table wants, as `held` says them.
 *
 * @param key the key
 * @returns for example "100"
 */
function wanted(key: Key): string {
  return `${Number(Boolean(key.ctrl))}${Number(Boolean(key.shift))}0`
}

/**
 * Whether a key press is the key of an action: the physical key and exactly its modifiers (Shift and Alt versions of Ctrl+P
 * are not Ctrl+P; Ctrl+Shift+P stays free).
 *
 * @param event the key press
 * @param actionId the action
 * @param mac whether it is a Mac (Cmd works as Ctrl there, and Ctrl as well)
 * @returns true when it is that key
 */
export function matches(event: KeyboardEvent, actionId: string, mac = isMac()): boolean {
  const key = keyOf(actionId)

  return key !== undefined && event.code === key.code && held(event, mac) === wanted(key)
}

/**
 * How a key is shown.
 *
 * @param key the key
 * @param mac whether it is a Mac
 * @returns its Mac label on a Mac if it has one, else its label
 */
function labelOf(key: Key, mac: boolean): string {
  return (mac && key.macLabel) || key.label
}

/**
 * How the key of an action is shown.
 *
 * @param actionId the action
 * @param mac whether it is a Mac
 * @returns the hint, or an empty string when the action has no key
 */
export function hintOf(actionId: string, mac = isMac()): string {
  const key = keyOf(actionId)

  return key === undefined ? '' : labelOf(key, mac)
}
