// A key combination (a chord) from plain values: what a key press is, how it is written for a person, and whether it may be given
// to a command. A chord is the physical key (`KeyboardEvent.code`, the same on every layout) and whether Ctrl (Cmd on a Mac) and
// Shift are held; Alt, and Meta off a Mac, belong to the system and make no chord.

/** A key combination. */
export interface Chord {
  /** The physical key: `KeyP`, `F6`, `Slash`. */
  code: string
  /** Whether Ctrl is held (Cmd on a Mac counts as well). */
  ctrl?: boolean
  /** Whether Shift is held. */
  shift?: boolean
}

/** The keys that are only modifiers: pressing one is the start of a chord, not a chord. */
const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
])

/** What the keys that are not a letter or a digit are called. */
const NAMES: Record<string, string> = {
  Slash: '/',
  Backslash: '\\',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: '\'',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
}

/** The chords that are the system's or the browser's: reloading, closing, quitting, and what Ctrl does to text. */
const RESERVED = new Set([
  'ctrl KeyR',
  'ctrl KeyW',
  'ctrl KeyQ',
  'ctrl KeyN',
  'ctrl KeyT',
  'ctrl KeyC',
  'ctrl KeyV',
  'ctrl KeyX',
  'ctrl KeyA',
  'ctrl KeyZ',
  'ctrl KeyY',
  'ctrl shift KeyI',
  'F5',
  'F11',
  'F12',
])

/** The letters Ctrl edits text with (select all, copy, paste, cut, undo, redo), whatever else is held with them. */
const TEXT_LETTERS = new Set(['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ', 'KeyY'])

/** The keys that move in text or erase it (a word at a time, to the ends, selecting with Shift) when Ctrl is held. */
const TEXT_MOVES = new Set([
  'Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Space',
])

/** Why a chord may not be given to a command. */
export type Why = 'needsModifier' | 'reserved'

/**
 * Whether something is text (a part of a label that is there).
 *
 * @param part a part, or false for one that is not
 * @returns true for text
 */
function isText(part: string | false | undefined): part is string {
  return typeof part === 'string'
}

/** The keys that are a letter or a digit: their name is the letter or the digit. */
const LETTER = /^Key(?<name>[A-Z])$/u
const DIGIT = /^(?:Digit|Numpad)(?<name>\d)$/u

/**
 * The name of a letter or a digit key.
 *
 * @param code the key's code
 * @returns the letter or the digit, or undefined for another key
 */
function nameFromPattern(code: string): string | undefined {
  return (LETTER.exec(code) ?? DIGIT.exec(code))?.groups?.name
}

/**
 * The words for a physical key.
 *
 * @param code the key's code
 * @returns its name: the letter, the digit, the F number, or a name from the table
 */
export function keyName(code: string): string {
  return NAMES[code] ?? nameFromPattern(code) ?? code
}

/** How the modifiers are written, on a Mac and elsewhere. */
const SIGNS = {
  mac: { ctrl: '⌘', shift: '⇧' },
  other: { ctrl: 'Ctrl', shift: 'Shift' },
}

/**
 * How a chord is written for a person: "Ctrl Shift P", and "⌘ ⇧ P" on a Mac.
 *
 * @param chord the chord
 * @param mac whether it is a Mac
 * @returns the text
 */
export function chordLabel(chord: Chord, mac: boolean): string {
  const signs = mac ? SIGNS.mac : SIGNS.other

  return [chord.ctrl && signs.ctrl, chord.shift && signs.shift, keyName(chord.code)].filter(isText).join(' ')
}

/**
 * Whether Ctrl is held, Cmd counting as Ctrl on a Mac.
 *
 * @param event the key press
 * @param mac whether it is a Mac
 * @returns true when it is
 */
function ctrlOf(event: KeyboardEvent, mac: boolean): boolean {
  return event.ctrlKey || (mac && event.metaKey)
}

/**
 * Whether a modifier that makes no chord is held: Alt, and Meta off a Mac.
 *
 * @param event the key press
 * @param mac whether it is a Mac
 * @returns true when one is
 */
function strayOf(event: KeyboardEvent, mac: boolean): boolean {
  return event.altKey || (!mac && event.metaKey)
}

/**
 * Whether a key is no key a chord can be made of: none at all, or a modifier alone.
 *
 * @param code the key's code
 * @returns true when it is
 */
function noKey(code: string): boolean {
  return code === '' || MODIFIER_CODES.has(code)
}

/**
 * The chord a key press is.
 *
 * @param event the key press
 * @param mac whether it is a Mac (Cmd is Ctrl there)
 * @returns the chord, or null for a press that is no chord: a modifier alone, or one with Alt (or Meta off a Mac) held
 */
export function chordOf(event: KeyboardEvent, mac: boolean): Chord | null {
  if (strayOf(event, mac) || noKey(event.code)) {
    return null
  }

  return { code: event.code, ctrl: ctrlOf(event, mac), shift: event.shiftKey }
}

/**
 * Whether two chords are the same key with the same modifiers.
 *
 * @param a one chord
 * @param b the other
 * @returns true when they are
 */
export function sameChord(a: Chord, b: Chord): boolean {
  return a.code === b.code && Boolean(a.ctrl) === Boolean(b.ctrl) && Boolean(a.shift) === Boolean(b.shift)
}

/**
 * The text that stands for a chord in a set: the same chords have the same text.
 *
 * @param chord the chord
 * @returns for example "ctrl shift KeyP"
 */
export function chordId(chord: Chord): string {
  return [chord.ctrl ? 'ctrl' : '', chord.shift ? 'shift' : '', chord.code].filter(part => part !== '').join(' ')
}

/**
 * Whether a chord is one that Ctrl edits or moves in text with.
 *
 * @param chord the chord
 * @returns true when it is
 */
function editsText(chord: Chord): boolean {
  return Boolean(chord.ctrl) && (TEXT_LETTERS.has(chord.code) || TEXT_MOVES.has(chord.code))
}

/**
 * Whether a chord is one the system, the browser or text editing keeps.
 *
 * @param chord the chord
 * @returns true when it is
 */
function isKept(chord: Chord): boolean {
  return editsText(chord) || RESERVED.has(chordId(chord))
}

/**
 * Whether a chord does not type: it has Ctrl, or is a function key.
 *
 * @param chord the chord
 * @returns true when it does not
 */
function typesNothing(chord: Chord): boolean {
  return Boolean(chord.ctrl) || /^F\d{1,2}$/u.test(chord.code)
}

/**
 * Why a chord may not be given to a command: a key that is typed (a letter, a digit, Enter, with nothing or only Shift held)
 * would take it from every text field, and the system's keys (reload, close, copy) belong to the system, as does what Ctrl
 * does to text (copy, paste, undo, erasing and moving by a word or to the ends, with or without Shift): the keymap prevents
 * the default of every key it knows, so a chord given away here would stop working in every field. Function keys may stand
 * alone.
 *
 * @param chord the chord
 * @returns the reason, or null when it may
 */
export function problemOf(chord: Chord): Why | null {
  if (isKept(chord)) {
    return 'reserved'
  }

  return typesNothing(chord) ? null : 'needsModifier'
}
