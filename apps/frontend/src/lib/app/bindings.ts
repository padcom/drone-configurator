// What the user may do with the keys of the application, from plain values (no DOM): the keys as the user has set them
// over the defaults, which of them meet (the same chord where both are in force: a key of the whole window meets every
// screen's, two keys of one screen meet, keys of different screens do not), the rebinding of an action to a chord and
// what stands in the way, and the text the choices are kept as. The table of keys is lib/app/keymap.ts; the settings
// keep the text.
import { type Chord, type Why, problemOf, sameChord } from './chords'

/** The scope of a key that works on every screen. */
export const GLOBAL = 'global'

/** A key as the application has it: an action, the scope it is in force in, and the chord. */
export interface Binding extends Chord {
  /** The command (or the behaviour of a module) the key stands for: `palette.open`. */
  actionId: string
  /** `global`, or the screen it works on (the first part of its path: `parameters`). */
  scope: string
  /** `keymap`: the keymap runs the command that is the action. `module`: a module listens for it and does what it is for. */
  listens: 'keymap' | 'module'
  /** The key may not be rebound (it is shown and checked for clashes). */
  fixed?: boolean
  /**
   * The character the default key types, by which it is matched too: `/` is Shift+7 on a German keyboard, so Ctrl+Shift+7 is
   * Ctrl+/ there. A chord the user chose is matched by its place only.
   */
  typed?: string
}

/** What the user chose over the defaults: a chord, or null for "no key" (an action that is not in it has its default). */
export type Overrides = Readonly<Record<string, Chord | null>>

/** Two keys that meet: the actions that both want the chord. */
export interface Clash {
  /** The first. */
  first: string
  /** The second. */
  second: string
}

/**
 * Whether two scopes are in force at the same time: a key of the whole window is, with every screen's.
 *
 * @param a one scope
 * @param b the other
 * @returns true when they are
 */
export function scopesMeet(a: string, b: string): boolean {
  return a === GLOBAL || b === GLOBAL || a === b
}

/**
 * The chord of an override, as a plain one (no field that is not a chord's).
 *
 * @param chord the chord
 * @returns the chord with its modifiers as true or false
 */
function plain(chord: Chord): Chord {
  return { code: chord.code, ctrl: Boolean(chord.ctrl), shift: Boolean(chord.shift) }
}

/**
 * A key with the user's choice over it: no key, or another chord. A key that is fixed is never changed.
 *
 * @param key the default
 * @param overrides what the user chose
 * @returns the key as it is now, or null for none
 */
function chosen<Key extends Binding>(key: Key, overrides: Overrides): Key | null {
  const choice = key.fixed ? undefined : overrides[key.actionId]

  if (choice === undefined) {
    return key
  }

  return choice === null ? null : { ...key, ...plain(choice), typed: undefined }
}

/**
 * The keys as they are now: the defaults, with what the user chose over them.
 *
 * @param defaults the table of keys
 * @param overrides what the user chose
 * @returns the keys that are in force (an action with no key is not in the list)
 */
export function applyOverrides<Key extends Binding>(defaults: readonly Key[], overrides: Overrides): Key[] {
  return defaults.map(key => chosen(key, overrides)).filter((key): key is Key => key !== null)
}

/**
 * Whether two keys are the same chord and in force together.
 *
 * @param a one key
 * @param b the other
 * @returns true when they meet
 */
function meet(a: Binding, b: Binding): boolean {
  return sameChord(a, b) && scopesMeet(a.scope, b.scope)
}

/**
 * Every pair of keys that meet.
 *
 * @param keys the keys in force
 * @returns the pairs, each once, in the order of the table
 */
export function clashes(keys: readonly Binding[]): Clash[] {
  return keys.flatMap((first, at) => keys.slice(at + 1).filter(second => meet(first, second)).map(second => ({
    first: first.actionId,
    second: second.actionId,
  })))
}

/**
 * The other actions that have a chord where an action would be in force.
 *
 * @param keys the keys in force
 * @param actionId the action that would have the chord
 * @param scope the scope it is in
 * @param chord the chord
 * @returns the other actions that would meet it
 */
export function clashesWith(keys: readonly Binding[], actionId: string, scope: string, chord: Chord): string[] {
  const wanted: Binding = { ...chord, actionId, scope, listens: 'keymap' }

  return keys.filter(key => key.actionId !== actionId && meet(key, wanted)).map(key => key.actionId)
}

/** What came of asking to give an action a chord. */
export type Rebinding
  = | { status: 'done', overrides: Overrides }
    | { status: 'refused', why: Why | 'fixed' }
    | { status: 'clash', with: string[] }

/**
 * The choices without one action's.
 *
 * @param overrides the choices
 * @param actionId the action
 * @returns the choices, the action having its default again
 */
export function without(overrides: Overrides, actionId: string): Overrides {
  return Object.fromEntries(Object.entries(overrides).filter(([id]) => id !== actionId))
}

/**
 * Whether the chord of an action is its default: a default is not kept as a choice.
 *
 * @param defaults the table of keys
 * @param actionId the action
 * @param chord the chord, or null for none
 * @returns true when it is the default
 */
function isDefault(defaults: readonly Binding[], actionId: string, chord: Chord | null): boolean {
  const key = defaults.find(candidate => candidate.actionId === actionId)

  return key !== undefined && chord !== null && sameChord(key, chord)
}

/**
 * The choices with one action's changed (or taken away, when it is back at its default).
 *
 * @param defaults the table of keys
 * @param overrides the choices now
 * @param actionId the action
 * @param chord the chord, or null for no key
 * @returns the new choices
 */
function choose(defaults: readonly Binding[], overrides: Overrides, actionId: string, chord: Chord | null): Overrides {
  const rest = without(overrides, actionId)

  return isDefault(defaults, actionId, chord) ? rest : { ...rest, [actionId]: chord === null ? null : plain(chord) }
}

/**
 * Why a chord may not be given to a command.
 *
 * @param chord the chord, or null for no key (which is always allowed)
 * @returns the reason, or null
 */
function whyNot(chord: Chord | null): Why | null {
  return chord === null ? null : problemOf(chord)
}

/**
 * Why an action's key may not be changed to a chord: the action cannot be rebound, or the chord may not be used.
 *
 * @param key the action's key in the table, if it is there
 * @param chord the chord, or null for no key
 * @returns the refusal, or null
 */
function refusal(key: Binding | undefined, chord: Chord | null): Rebinding | null {
  if (key === undefined || key.fixed) {
    return { status: 'refused', why: 'fixed' }
  }
  const why = whyNot(chord)

  return why === null ? null : { status: 'refused', why }
}

/**
 * The choices once an action has a chord that no other action in force has, or the actions that have it.
 *
 * @param defaults the table of keys
 * @param overrides the choices now
 * @param key the action's key in the table
 * @param chord the chord, or null for no key
 * @returns what came of it
 */
function settle(defaults: readonly Binding[], overrides: Overrides, key: Binding, chord: Chord | null): Rebinding {
  const others = chord === null ? [] : clashesWith(applyOverrides(defaults, overrides), key.actionId, key.scope, chord)

  return others.length > 0
    ? { status: 'clash', with: others }
    : { status: 'done', overrides: choose(defaults, overrides, key.actionId, chord) }
}

/**
 * Gives an action a chord, or no key. Where the chord is another action's, nothing is changed and the other actions are named
 * (the person decides; `takeOver` then gives the chord to this action and takes it from them).
 *
 * @param defaults the table of keys
 * @param overrides the choices now
 * @param actionId the action
 * @param chord the chord, or null for no key
 * @returns what came of it
 */
export function rebind(defaults: readonly Binding[], overrides: Overrides, actionId: string, chord: Chord | null): Rebinding {
  const key = defaults.find(candidate => candidate.actionId === actionId)
  const refused = refusal(key, chord)

  return refused ?? settle(defaults, overrides, key as Binding, chord)
}

/**
 * Whether an action is a key that is fixed.
 *
 * @param defaults the table of keys
 * @param actionId the action
 * @returns true when it is
 */
function isFixed(defaults: readonly Binding[], actionId: string): boolean {
  return defaults.some(candidate => candidate.actionId === actionId && candidate.fixed === true)
}

/**
 * Gives an action a chord that other actions have, and takes it from them: they have no key then. A key that is fixed cannot be
 * taken.
 *
 * @param defaults the table of keys
 * @param overrides the choices now
 * @param actionId the action
 * @param chord the chord
 * @returns what came of it: done, or refused when one of them cannot be taken from
 */
export function takeOver(defaults: readonly Binding[], overrides: Overrides, actionId: string, chord: Chord): Rebinding {
  const scope = defaults.find(candidate => candidate.actionId === actionId)?.scope ?? GLOBAL
  const others = clashesWith(applyOverrides(defaults, overrides), actionId, scope, chord)

  if (others.some(other => isFixed(defaults, other))) {
    return { status: 'refused', why: 'fixed' }
  }
  const freed = others.reduce<Overrides>((rest, other) => choose(defaults, rest, other, null), overrides)

  return { status: 'done', overrides: choose(defaults, freed, actionId, chord) }
}

/**
 * Whether a modifier of a parsed chord is there as true or false, or not there.
 *
 * @param value the modifier
 * @returns true when it is a flag or nothing
 */
function isFlag(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}

/**
 * Whether both modifiers of a parsed chord are flags or not there.
 *
 * @param chord the parsed chord
 * @returns true when they are
 */
function flagsOk(chord: Partial<Record<keyof Chord, unknown>>): boolean {
  return isFlag(chord.ctrl) && isFlag(chord.shift)
}

/**
 * Whether a parsed value is a chord.
 *
 * @param value anything
 * @returns true for an object with a code and, where they are there, modifiers that are true or false
 */
function isChord(value: unknown): value is Chord {
  const chord = value as Partial<Record<keyof Chord, unknown>> | null

  return typeof chord === 'object' && chord !== null && typeof chord.code === 'string' && flagsOk(chord)
}

/**
 * Whether a choice read from a text is one to keep.
 *
 * @param actionId the action
 * @param value its chord, or null
 * @param rebindable the actions whose keys may be changed
 * @returns true when the action may be rebound and the chord is one that may be used (or it is none)
 */
function kept(actionId: string, value: unknown, rebindable: readonly string[]): boolean {
  return rebindable.includes(actionId) && (value === null || (isChord(value) && problemOf(value) === null))
}

/**
 * Whether a parsed value is an object that is not an array.
 *
 * @param value anything
 * @returns true for one
 */
function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The object a text holds.
 *
 * @param text the text, if there is one
 * @returns its entries, or none when it is not an object (it is no JSON, it is an array, a number, nothing)
 */
function entriesOf(text: string | undefined): [string, unknown][] {
  try {
    const raw: unknown = JSON.parse(text ?? 'null')

    return isObject(raw) ? Object.entries(raw) : []
  } catch {
    return []
  }
}

/**
 * The choices in a text the settings hold: anything that is not a choice for an action that may be rebound, or is a chord that
 * may not be used, is left out (a text that was edited by hand, or written for another version).
 *
 * @param text what the settings hold, if anything
 * @param rebindable the actions whose keys may be changed
 * @returns the choices
 */
export function parseOverrides(text: string | undefined, rebindable: readonly string[]): Overrides {
  const good = entriesOf(text).filter(([actionId, value]) => kept(actionId, value, rebindable))

  return Object.fromEntries(good.map(([actionId, value]) => [actionId, value === null ? null : plain(value as Chord)]))
}

/**
 * The text the settings keep for the choices.
 *
 * @param overrides the choices
 * @returns the text
 */
export function serialiseOverrides(overrides: Overrides): string {
  return JSON.stringify(overrides)
}
