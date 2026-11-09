import { describe, expect, it } from 'vitest'
import { isPaneKey, nextPane } from './paneFocus'

/**
 * Three panes with a button in each, in a page.
 *
 * @returns the panes and the buttons
 */
function page() {
  const pane = (n: number) => `<section id="p${n}" tabindex="-1"><button id="b${n}">b</button></section>`
  document.body.innerHTML = [1, 2, 3].map(pane).join('')
  const panes = [...document.querySelectorAll<HTMLElement>('section')]

  return { panes, buttons: [...document.querySelectorAll<HTMLElement>('button')] }
}

describe('the key that moves between panes', () => {
  it.each([
    ['F6', {}, true],
    ['F6', { shiftKey: true }, true],
    ['F5', {}, false],
    ['f', {}, false],
    ['F6', { altKey: true }, false],
    ['F6', { ctrlKey: true }, false],
    ['F6', { metaKey: true }, false],
  ])('%s with %o is %s', (key, modifiers, is) => {
    expect(isPaneKey(new KeyboardEvent('keydown', { key, ...modifiers }))).toBe(is)
  })
})

describe('the pane that gets the focus', () => {
  it('is the next one, and the first after the last', () => {
    const { panes, buttons } = page()

    expect(nextPane(panes, buttons[0]!, false)).toBe(panes[1])
    expect(nextPane(panes, buttons[1]!, false)).toBe(panes[2])
    expect(nextPane(panes, buttons[2]!, false)).toBe(panes[0])
  })

  it('is the previous one with Shift, and the last before the first', () => {
    const { panes, buttons } = page()

    expect(nextPane(panes, buttons[2]!, true)).toBe(panes[1])
    expect(nextPane(panes, buttons[1]!, true)).toBe(panes[0])
    expect(nextPane(panes, buttons[0]!, true)).toBe(panes[2])
  })
})

describe('the pane that gets the focus, from outside or from the pane itself', () => {
  it('counts a pane itself as being in it', () => {
    const { panes } = page()

    expect(nextPane(panes, panes[0]!, false)).toBe(panes[1])
  })

  it('is the first going forwards and the last going backwards when the focus is in none of them', () => {
    const { panes } = page()
    const outside = document.createElement('input')
    document.body.append(outside)

    expect(nextPane(panes, outside, false)).toBe(panes[0])
    expect(nextPane(panes, outside, true)).toBe(panes[2])
    expect(nextPane(panes, null, false)).toBe(panes[0])
  })
})

describe('the pane that gets the focus, at the edges', () => {
  it('is nothing when there are no panes', () => {
    expect(nextPane([], null, false)).toBeUndefined()
    expect(nextPane([], null, true)).toBeUndefined()
  })

  it('stays on the only pane there is', () => {
    const { panes, buttons } = page()

    expect(nextPane([panes[0]!], buttons[0]!, false)).toBe(panes[0])
    expect(nextPane([panes[0]!], buttons[0]!, true)).toBe(panes[0])
  })
})
