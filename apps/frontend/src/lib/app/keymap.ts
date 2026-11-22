// The keys of the application, in ONE table: what listens for a key (composables/useCommandKeys.ts: a key whose `actionId` is
// a command's id runs that command, with no visible element) and what shows one (the key hint in a row of the palette, the
// help of the keys, Settings) read it here. To give a command a key, add a row with the command's id as `actionId`.
//
// The table holds the DEFAULTS. What the user chose over them (lib/app/bindings.ts, kept in the settings) is set with
// `setBindings`, and every function here then answers for the keys as they are now; the keys that are in force are
// `currentKeys()`. A key has a SCOPE: `global` works on every screen, a screen's name only there; two keys meet when they are the
// same chord in scopes that are in force together (a global key meets every screen's).
//
// The table also lists the keys that exist in their own modules: F6 and Shift+F6 (paneFocus.ts, which asks `matches`, so they may
// be rebound) and Ctrl+/ and Ctrl+Enter (paramShortcuts.ts, matched by the character of the key, since `/` is Shift+7 on a German
// keyboard: they are `fixed`, shown and checked for clashes, and not rebound). `listens` says who listens for a key.
import { type Chord, chordLabel, sameChord } from './chords'
import { type Binding, type Overrides, GLOBAL, applyOverrides } from './bindings'

/** One key of the table (`listens` says whether the keymap listens for it, or a module does). */
export type Key = Binding

/** The default keys. No two meet (the keymap test checks). */
export const KEYS: readonly Key[] = [
  { actionId: 'palette.open', code: 'KeyP', ctrl: true, scope: GLOBAL, listens: 'keymap' },
  { actionId: 'help.keys', code: 'F1', scope: GLOBAL, listens: 'keymap' },
  { actionId: 'panes.next', code: 'F6', scope: GLOBAL, listens: 'module' },
  { actionId: 'panes.previous', code: 'F6', shift: true, scope: GLOBAL, listens: 'module' },
  { actionId: 'params.search', code: 'Slash', ctrl: true, scope: 'parameters', listens: 'module', fixed: true },
  { actionId: 'params.write', code: 'Enter', ctrl: true, scope: 'parameters', listens: 'module', fixed: true },
]

/** The keys in force now. */
let active: readonly Key[] = KEYS

/**
 * Sets what the user chose over the defaults: the keys are as they say from now on.
 *
 * @param overrides the user's choices (none: the defaults)
 */
export function setBindings(overrides: Overrides): void {
  active = applyOverrides(KEYS, overrides)
}

/**
 * The keys that are in force.
 *
 * @returns the defaults with the user's choices over them
 */
export function currentKeys(): readonly Key[] {
  return active
}

/** Whether the next key press is being read as a chord for an action (Settings): no key does its command then. */
let listening = false

/**
 * Says that the next key presses are chords to read, not commands to run (a key that is being chosen would otherwise do what
 * it does now: Ctrl+P would open the palette).
 *
 * @param on true while a chord is being read
 */
export function setListening(on: boolean): void {
  listening = on
}

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
  return active.find(key => key.actionId === actionId)
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
 * Whether a key press is exactly a chord: the physical key and its modifiers (Shift and Alt versions of Ctrl+P are not Ctrl+P;
 * Ctrl+Shift+P stays free).
 *
 * @param event the key press
 * @param chord the chord
 * @param mac whether it is a Mac
 * @returns true when it is
 */
function isChord(event: KeyboardEvent, chord: Chord, mac: boolean): boolean {
  const held: Chord = { code: event.code, ctrl: ctrlHeld(event, mac), shift: event.shiftKey }

  return !strayHeld(event, mac) && sameChord(held, chord)
}

/**
 * Whether a key press is the key of an action.
 *
 * @param event the key press
 * @param actionId the action
 * @param mac whether it is a Mac (Cmd works as Ctrl there, and Ctrl as well)
 * @returns true when it is that key
 */
export function matches(event: KeyboardEvent, actionId: string, mac = isMac()): boolean {
  const key = keyOf(actionId)

  return !listening && key !== undefined && isChord(event, key, mac)
}

/**
 * How the key of an action is shown.
 *
 * @param actionId the action
 * @param mac whether it is a Mac
 * @returns the hint ("Ctrl P", "⌘ P" on a Mac), or an empty string when the action has no key
 */
export function hintOf(actionId: string, mac = isMac()): string {
  const key = keyOf(actionId)

  return key === undefined ? '' : chordLabel(key, mac)
}
