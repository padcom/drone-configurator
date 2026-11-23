// A key combination from plain values: what a key press is, how it is written for a person, and which chords may be
// given to a command.
import { describe, expect, it } from 'vitest'
import { chordLabel, chordOf, keyName, problemOf, sameChord } from './chords'

/**
 * A key press.
 *
 * @param init what the event has
 * @returns the event
 */
const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('the chord of a key press', () => {
  it('is the physical key with Ctrl and Shift as they are held, the same on any layout', () => {
    expect(chordOf(press({ code: 'KeyP', key: 'з', ctrlKey: true }), false)).toEqual({ code: 'KeyP', ctrl: true, shift: false })
    expect(chordOf(press({ code: 'F6', shiftKey: true }), false)).toEqual({ code: 'F6', ctrl: false, shift: true })
  })

  it('takes Cmd for Ctrl on a Mac, and not off one (where it is the system\'s)', () => {
    expect(chordOf(press({ code: 'KeyP', metaKey: true }), true)).toEqual({ code: 'KeyP', ctrl: true, shift: false })
    expect(chordOf(press({ code: 'KeyP', metaKey: true }), false)).toBeNull()
  })

  it('is none for a press with Alt, a modifier alone, or no key', () => {
    expect(chordOf(press({ code: 'KeyP', altKey: true }), false)).toBeNull()
    expect(chordOf(press({ code: 'ControlLeft', ctrlKey: true }), false)).toBeNull()
    expect(chordOf(press({ code: 'ShiftRight', shiftKey: true }), false)).toBeNull()
    expect(chordOf(press({ key: 'Unidentified' }), false)).toBeNull()
  })
})

describe('how a chord is written', () => {
  it('is Ctrl, Shift, then the key, and with the signs on a Mac', () => {
    expect(chordLabel({ code: 'KeyP', ctrl: true }, false)).toBe('Ctrl P')
    expect(chordLabel({ code: 'KeyP', ctrl: true }, true)).toBe('⌘ P')
    expect(chordLabel({ code: 'F6', shift: true }, false)).toBe('Shift F6')
    expect(chordLabel({ code: 'F6', shift: true }, true)).toBe('⇧ F6')
    expect(chordLabel({ code: 'KeyK', ctrl: true, shift: true }, false)).toBe('Ctrl Shift K')
  })

  it('names the keys that are not a letter', () => {
    expect([keyName('Slash'), keyName('Digit7'), keyName('Numpad3'), keyName('ArrowUp'), keyName('PageDown')])
      .toEqual(['/', '7', '3', '↑', 'Page Down'])
    expect(keyName('F12')).toBe('F12')
    expect(keyName('IntlBackslash')).toBe('IntlBackslash')
  })
})

describe('the same chord', () => {
  it('is the same key with the same modifiers, a modifier that is not said being off', () => {
    expect(sameChord({ code: 'KeyP', ctrl: true }, { code: 'KeyP', ctrl: true, shift: false })).toBe(true)
    expect(sameChord({ code: 'KeyP', ctrl: true }, { code: 'KeyP', ctrl: true, shift: true })).toBe(false)
    expect(sameChord({ code: 'KeyP', ctrl: true }, { code: 'KeyO', ctrl: true })).toBe(false)
    expect(sameChord({ code: 'F6' }, { code: 'F6', ctrl: true })).toBe(false)
  })
})

describe('a chord that may be given to a command', () => {
  it('has Ctrl, or is a function key', () => {
    expect(problemOf({ code: 'KeyK', ctrl: true })).toBeNull()
    expect(problemOf({ code: 'KeyK', ctrl: true, shift: true })).toBeNull()
    expect(problemOf({ code: 'F1' })).toBeNull()
    expect(problemOf({ code: 'F2', shift: true })).toBeNull()
  })

  it('is not a key that is typed (a letter, a digit, Enter, with nothing or only Shift)', () => {
    expect(problemOf({ code: 'KeyK' })).toBe('needsModifier')
    expect(problemOf({ code: 'KeyK', shift: true })).toBe('needsModifier')
    expect(problemOf({ code: 'Enter' })).toBe('needsModifier')
    expect(problemOf({ code: 'Digit5' })).toBe('needsModifier')
  })

  it('is not one the system or the browser has (reload, close, quit, what Ctrl does to text)', () => {
    expect(problemOf({ code: 'KeyR', ctrl: true })).toBe('reserved')
    expect(problemOf({ code: 'KeyW', ctrl: true })).toBe('reserved')
    expect(problemOf({ code: 'KeyC', ctrl: true })).toBe('reserved')
    expect(problemOf({ code: 'F5' })).toBe('reserved')
    expect(problemOf({ code: 'F11' })).toBe('reserved')
  })
})

describe('a chord that is what Ctrl does to text', () => {
  it('is not one to give (erase, move by a word, to the ends, copy, paste, undo), Shift or not', () => {
    expect(problemOf({ code: 'Backspace', ctrl: true })).toBe('reserved')
    expect(problemOf({ code: 'Delete', ctrl: true })).toBe('reserved')
    expect(problemOf({ code: 'ArrowLeft', ctrl: true, shift: true })).toBe('reserved')
    expect(problemOf({ code: 'Home', ctrl: true })).toBe('reserved')
    expect(problemOf({ code: 'End', ctrl: true, shift: true })).toBe('reserved')
    expect(problemOf({ code: 'KeyZ', ctrl: true, shift: true })).toBe('reserved')
    expect(problemOf({ code: 'KeyV', ctrl: true, shift: true })).toBe('reserved')
  })
})
