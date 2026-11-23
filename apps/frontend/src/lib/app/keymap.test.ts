// The one table of keys: no two keys alike, and what counts as the key of an action (the physical key, exactly its modifiers).
import { afterEach, describe, expect, it } from 'vitest'
import { KEYS, currentKeys, firesWhileTyping, hintOf, isTypingTarget, keyOf, matches, setBindings, setListening } from './keymap'

/**
 * A key press.
 *
 * @param init what the event has
 * @returns the event
 */
const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

describe('the table', () => {
  it('has no two entries with the same key and modifiers, and no action twice', () => {
    const keys = KEYS.map(key => `${key.code} ${Boolean(key.ctrl)} ${Boolean(key.shift)}`)
    const actions = KEYS.map(key => key.actionId)

    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(actions).size).toBe(actions.length)
  })

  it('has Ctrl+P for the palette, listened for here, and the keys of other modules as notes', () => {
    expect(keyOf('palette.open')).toMatchObject({ code: 'KeyP', ctrl: true, listens: 'keymap' })
    expect(KEYS.filter(key => key.listens === 'module').map(key => key.actionId))
      .toEqual(['panes.next', 'panes.previous', 'params.search', 'params.write'])
    expect(keyOf('nothing.here')).toBeUndefined()
  })
})

describe('the key of the palette: which presses are it', () => {
  it('is Ctrl+P by the physical key: also on a layout where the letter is another (Russian, Caps Lock)', () => {
    expect(matches(press({ code: 'KeyP', key: 'p', ctrlKey: true }), 'palette.open', false)).toBe(true)
    expect(matches(press({ code: 'KeyP', key: 'з', ctrlKey: true }), 'palette.open', false)).toBe(true)
    expect(matches(press({ code: 'KeyP', key: 'P', ctrlKey: true }), 'palette.open', false)).toBe(true)
  })
})

describe('the key of the palette: which presses are not it', () => {
  it.each([
    ['without Ctrl', { code: 'KeyP' }],
    ['with Shift', { code: 'KeyP', ctrlKey: true, shiftKey: true }],
    ['with Alt', { code: 'KeyP', ctrlKey: true, altKey: true }],
    ['with Cmd off a Mac', { code: 'KeyP', ctrlKey: true, metaKey: true }],
    ['another key', { code: 'KeyO', ctrlKey: true }],
  ])('is not it %s', (_name, init) => {
    expect(matches(press(init), 'palette.open', false)).toBe(false)
  })

  it('is also Cmd+P on a Mac, and Ctrl+P there too, but not with Alt', () => {
    expect(matches(press({ code: 'KeyP', metaKey: true }), 'palette.open', true)).toBe(true)
    expect(matches(press({ code: 'KeyP', ctrlKey: true }), 'palette.open', true)).toBe(true)
    expect(matches(press({ code: 'KeyP', metaKey: true, altKey: true }), 'palette.open', true)).toBe(false)
  })

  it('is not asked about an action that has no key', () => {
    expect(matches(press({ code: 'KeyP', ctrlKey: true }), 'nothing.here', false)).toBe(false)
  })

  it('does not take Shift+F6 for F6, nor F6 for Shift+F6', () => {
    expect(matches(press({ code: 'F6' }), 'panes.next', false)).toBe(true)
    expect(matches(press({ code: 'F6', shiftKey: true }), 'panes.next', false)).toBe(false)
    expect(matches(press({ code: 'F6', shiftKey: true }), 'panes.previous', false)).toBe(true)
  })
})

describe('how a key is shown', () => {
  it('is "Ctrl P", and "⌘ P" on a Mac; nothing for an action without a key', () => {
    expect(hintOf('palette.open', false)).toBe('Ctrl P')
    expect(hintOf('palette.open', true)).toBe('⌘ P')
    expect(hintOf('panes.next', true)).toBe('F6')
    expect(hintOf('nothing.here', false)).toBe('')
  })
})

describe('the keys in a text field', () => {
  it('are left to the field when they type (a letter, Shift or not), and fire with Ctrl or as a function key', () => {
    expect(firesWhileTyping({ code: 'KeyK' })).toBe(false)
    expect(firesWhileTyping({ code: 'KeyK', shift: true })).toBe(false)
    expect(firesWhileTyping({ code: 'KeyK', ctrl: true })).toBe(true)
    expect(firesWhileTyping({ code: 'F1' })).toBe(true)
    expect(firesWhileTyping({ code: 'F6', shift: true })).toBe(true)
  })

  it('are told by where the focus is: an input, a textarea, a select, an editable element; not a button or nothing', () => {
    const make = (tag: string) => document.createElement(tag)
    const editable = make('div')
    editable.contentEditable = 'true'
    // (jsdom does not work out isContentEditable from the attribute)
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    expect([make('input'), make('textarea'), make('select'), editable].map(isTypingTarget)).toEqual([true, true, true, true])
    expect([make('button'), make('div'), null, window].map(isTypingTarget)).toEqual([false, false, false, false])
  })
})

describe('the keys the user chose', () => {
  afterEach(() => {
    setBindings({})
    setListening(false)
  })

  it('are the keys from then on: the new chord matches and shows, the old one does not, and a key taken off has none', () => {
    setBindings({ 'palette.open': { code: 'KeyK', ctrl: true }, 'help.keys': null })

    expect(matches(press({ code: 'KeyK', ctrlKey: true }), 'palette.open', false)).toBe(true)
    expect(matches(press({ code: 'KeyP', ctrlKey: true }), 'palette.open', false)).toBe(false)
    expect(hintOf('palette.open', false)).toBe('Ctrl K')
    expect(keyOf('help.keys')).toBeUndefined()
    expect(currentKeys().some(key => key.actionId === 'help.keys')).toBe(false)
  })

  it('do not match while a key is being read as a chord', () => {
    setListening(true)
    expect(matches(press({ code: 'KeyP', ctrlKey: true }), 'palette.open', false)).toBe(false)
    setListening(false)
    expect(matches(press({ code: 'KeyP', ctrlKey: true }), 'palette.open', false)).toBe(true)
  })
})

describe("the Parameters screen's keys", () => {
  afterEach(() => {
    setBindings({})
  })

  it('move when they are chosen: the chosen chord matches, and the character of the default no longer does', () => {
    const slash = press({ key: '/', code: 'Digit7', ctrlKey: true, shiftKey: true })
    expect(matches(slash, 'params.search', false)).toBe(true)

    setBindings({ 'params.search': { code: 'KeyK', ctrl: true } })
    expect(matches(press({ code: 'KeyK', ctrlKey: true }), 'params.search', false)).toBe(true)
    expect(matches(slash, 'params.search', false)).toBe(false)
    expect(keyOf('params.search')?.typed).toBeUndefined()

    setBindings({})
    expect(currentKeys()).toEqual(KEYS)
  })

  it('match a typed character only with Ctrl alone (Shift for a character, never for Enter)', () => {
    expect(matches(press({ key: 'Enter', code: 'NumpadEnter', ctrlKey: true }), 'params.write', false)).toBe(true)
    const shiftEnter = press({ key: 'Enter', code: 'NumpadEnter', ctrlKey: true, shiftKey: true })
    expect(matches(shiftEnter, 'params.write', false)).toBe(false)
    expect(matches(press({ key: '/', code: 'Digit7', ctrlKey: true, altKey: true }), 'params.search', false)).toBe(false)
    expect(matches(press({ key: '/', code: 'Slash' }), 'params.search', false)).toBe(false)
  })
})
