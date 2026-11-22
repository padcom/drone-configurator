// What the user may do with the keys: the choices over the defaults, which keys meet (scope and conflict), rebinding and taking a
// chord over, and the text the choices are kept as.
import { describe, expect, it } from 'vitest'
import {
  type Binding,
  GLOBAL,
  applyOverrides,
  clashes,
  clashesWith,
  parseOverrides,
  rebind,
  scopesMeet,
  serialiseOverrides,
  takeOver,
} from './bindings'

const DEFAULTS: Binding[] = [
  { actionId: 'palette.open', code: 'KeyP', ctrl: true, scope: GLOBAL, listens: 'keymap' },
  { actionId: 'help.keys', code: 'F1', scope: GLOBAL, listens: 'keymap' },
  { actionId: 'panes.next', code: 'F6', scope: GLOBAL, listens: 'module' },
  { actionId: 'params.search', code: 'Slash', ctrl: true, scope: 'parameters', listens: 'module', fixed: true },
  { actionId: 'plan.undo', code: 'KeyU', ctrl: true, scope: 'plan', listens: 'keymap' },
  { actionId: 'params.go', code: 'KeyG', ctrl: true, scope: 'parameters', listens: 'keymap' },
]
const REBINDABLE = DEFAULTS.filter(key => !key.fixed).map(key => key.actionId)

describe('the scopes', () => {
  it('meet when one is the whole window, or they are the same screen', () => {
    expect(scopesMeet(GLOBAL, 'plan')).toBe(true)
    expect(scopesMeet('plan', GLOBAL)).toBe(true)
    expect(scopesMeet('plan', 'plan')).toBe(true)
    expect(scopesMeet('plan', 'parameters')).toBe(false)
  })
})

describe('the keys with the user\'s choices over them', () => {
  it('are the defaults when nothing is chosen', () => {
    expect(applyOverrides(DEFAULTS, {})).toEqual(DEFAULTS)
  })

  it('have another chord for an action that was given one, and none for one that was given null', () => {
    const keys = applyOverrides(DEFAULTS, { 'palette.open': { code: 'KeyK', ctrl: true }, 'help.keys': null })

    const palette = keys.find(key => key.actionId === 'palette.open')

    expect(palette).toMatchObject({ code: 'KeyK', ctrl: true, shift: false, scope: GLOBAL })
    expect(keys.find(key => key.actionId === 'help.keys')).toBeUndefined()
    expect(keys).toHaveLength(DEFAULTS.length - 1)
  })

  it('are never changed for a key that is fixed', () => {
    const keys = applyOverrides(DEFAULTS, { 'params.search': { code: 'KeyK', ctrl: true } })

    expect(keys.find(key => key.actionId === 'params.search')).toMatchObject({ code: 'Slash' })
  })
})

describe('the keys that meet', () => {
  it('are the same chord in scopes that are in force together', () => {
    const keys: Binding[] = [
      { actionId: 'a', code: 'KeyK', ctrl: true, scope: GLOBAL, listens: 'keymap' },
      { actionId: 'b', code: 'KeyK', ctrl: true, scope: 'plan', listens: 'keymap' },
      { actionId: 'c', code: 'KeyK', ctrl: true, scope: 'parameters', listens: 'keymap' },
      { actionId: 'd', code: 'KeyK', ctrl: true, shift: true, scope: GLOBAL, listens: 'keymap' },
    ]

    expect(clashes(keys)).toEqual([{ first: 'a', second: 'b' }, { first: 'a', second: 'c' }])
  })

  it('are none in the defaults, and the others an action would meet are named', () => {
    expect(clashes(DEFAULTS)).toEqual([])
    expect(clashesWith(DEFAULTS, 'plan.undo', 'plan', { code: 'KeyP', ctrl: true })).toEqual(['palette.open'])
    expect(clashesWith(DEFAULTS, 'plan.undo', 'plan', { code: 'Slash', ctrl: true })).toEqual([])
    expect(clashesWith(DEFAULTS, 'palette.open', GLOBAL, { code: 'Slash', ctrl: true })).toEqual(['params.search'])
  })
})

describe('giving an action a chord', () => {
  it('is kept as a choice, and a chord that is the default is not kept', () => {
    const moved = rebind(DEFAULTS, {}, 'palette.open', { code: 'KeyK', ctrl: true })

    expect(moved).toEqual({ status: 'done', overrides: { 'palette.open': { code: 'KeyK', ctrl: true, shift: false } } })
    expect(rebind(DEFAULTS, { 'palette.open': { code: 'KeyK', ctrl: true } }, 'palette.open', { code: 'KeyP', ctrl: true }))
      .toEqual({ status: 'done', overrides: {} })
  })

  it('may be no key at all', () => {
    expect(rebind(DEFAULTS, {}, 'help.keys', null)).toEqual({ status: 'done', overrides: { 'help.keys': null } })
  })

  it('is refused for a chord that may not be used, and for a key that is fixed or is not there', () => {
    expect(rebind(DEFAULTS, {}, 'palette.open', { code: 'KeyK' })).toEqual({ status: 'refused', why: 'needsModifier' })
    expect(rebind(DEFAULTS, {}, 'palette.open', { code: 'KeyW', ctrl: true })).toEqual({ status: 'refused', why: 'reserved' })
    expect(rebind(DEFAULTS, {}, 'params.search', { code: 'KeyK', ctrl: true })).toEqual({ status: 'refused', why: 'fixed' })
    expect(rebind(DEFAULTS, {}, 'nothing', { code: 'KeyK', ctrl: true })).toEqual({ status: 'refused', why: 'fixed' })
  })

  it('names the actions that have the chord, and changes nothing', () => {
    expect(rebind(DEFAULTS, {}, 'help.keys', { code: 'KeyP', ctrl: true })).toEqual({ status: 'clash', with: ['palette.open'] })
    expect(rebind(DEFAULTS, {}, 'plan.undo', { code: 'KeyP', ctrl: true })).toEqual({ status: 'clash', with: ['palette.open'] })
  })

  it('does not meet the key of a screen that is not in force with it', () => {
    expect(rebind(DEFAULTS, {}, 'plan.undo', { code: 'KeyG', ctrl: true }).status).toBe('done')
    expect(rebind(DEFAULTS, {}, 'params.go', { code: 'KeyU', ctrl: true }).status).toBe('done')
  })
})

describe('taking a chord over', () => {
  it('gives it to the action and takes it from the others, which have no key then', () => {
    const result = takeOver(DEFAULTS, {}, 'help.keys', { code: 'KeyP', ctrl: true })

    expect(result).toEqual({
      status: 'done',
      overrides: { 'palette.open': null, 'help.keys': { code: 'KeyP', ctrl: true, shift: false } },
    })
  })

  it('is refused when one of them is a key that is fixed', () => {
    expect(takeOver(DEFAULTS, {}, 'palette.open', { code: 'Slash', ctrl: true })).toEqual({ status: 'refused', why: 'fixed' })
  })
})

describe('the text the choices are kept as', () => {
  it('reads back what was written', () => {
    const choices = { 'palette.open': { code: 'KeyK', ctrl: true, shift: false }, 'help.keys': null }

    expect(parseOverrides(serialiseOverrides(choices), REBINDABLE)).toEqual(choices)
  })

  it('leaves out what is not a choice: no text, no JSON, other shapes, other actions, chords that may not be used', () => {
    expect(parseOverrides(undefined, REBINDABLE)).toEqual({})
    expect(parseOverrides('not json', REBINDABLE)).toEqual({})
    expect(parseOverrides('[1,2]', REBINDABLE)).toEqual({})
    expect(parseOverrides('{"nothing": null, "params.search": null}', REBINDABLE)).toEqual({})
    const odd = '{"palette.open": {"code": 5}, "help.keys": {"code": "KeyK"}, "plan.undo": "x"}'

    expect(parseOverrides(odd, REBINDABLE)).toEqual({})
    expect(parseOverrides('{"palette.open": {"code": "KeyK", "ctrl": "yes"}}', REBINDABLE)).toEqual({})
  })

  it('keeps the choices that are good next to the ones that are not', () => {
    const text = '{"palette.open": {"code": "KeyK", "ctrl": true}, "help.keys": {"code": "KeyK"}, "plan.undo": null}'

    const palette = { code: 'KeyK', ctrl: true, shift: false }

    expect(parseOverrides(text, REBINDABLE)).toEqual({ 'palette.open': palette, 'plan.undo': null })
  })
})
