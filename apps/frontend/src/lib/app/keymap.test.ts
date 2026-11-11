// The one table of keys: no two keys alike, and what counts as the key of an action (the physical key, exactly its modifiers).
import { describe, expect, it } from 'vitest'
import { KEYS, hintOf, keyOf, matches } from './keymap'

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
