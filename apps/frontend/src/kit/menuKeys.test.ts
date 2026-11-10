import { describe, expect, it } from 'vitest'
import { type MenuItem, edge, pageStep, rowsFitting, step, typeAhead } from './menuKeys'

const ITEMS: MenuItem[] = [
  { id: 'fly', label: 'Fly here' },
  { id: 'home', label: 'Set home here', disabled: true },
  { id: 'look', label: 'Look at this point' },
  { id: 'copy', label: 'Copy coordinates', hint: 'Ctrl C' },
  { id: 'fence', label: 'Fence here', disabled: true },
]

describe('the next item of a menu', () => {
  it('is the next one that can be chosen, skipping a disabled one, and wraps round', () => {
    expect(step(ITEMS, 0, 1)).toBe(2)
    expect(step(ITEMS, 2, 1)).toBe(3)
    expect(step(ITEMS, 3, 1)).toBe(0)
    expect(step(ITEMS, 0, -1)).toBe(3)
    expect(step(ITEMS, 2, -1)).toBe(0)
  })

  it('is the first item for a focus that is on none, going down', () => {
    expect(step(ITEMS, -1, 1)).toBe(0)
  })

  it('is none when nothing can be chosen, or there are no items', () => {
    expect(step([{ id: 'a', label: 'A', disabled: true }], 0, 1)).toBe(-1)
    expect(step([], -1, 1)).toBe(-1)
  })

  it('has its ends at the first and the last that can be chosen', () => {
    expect(edge(ITEMS, 'first')).toBe(0)
    expect(edge(ITEMS, 'last')).toBe(3)
    expect(edge([{ id: 'a', label: 'A', disabled: true }, { id: 'b', label: 'B' }], 'first')).toBe(1)
  })
})

describe('type-ahead', () => {
  it('goes to the next item that starts with the letter, whatever the case, and on again with the same letter', () => {
    expect(typeAhead(ITEMS, 0, 'l')).toBe(2)
    expect(typeAhead(ITEMS, 2, 'c')).toBe(3)
    expect(typeAhead([...ITEMS, { id: 'c2', label: 'Compass' }], 3, 'c')).toBe(5)
  })

  it('goes to the item that starts with all the letters typed, looking from where the focus is', () => {
    expect(typeAhead(ITEMS, 0, 'co')).toBe(3)
    expect(typeAhead(ITEMS, 2, 'look')).toBe(2)
  })

  it('does not land on a disabled item, and is none when nothing fits', () => {
    expect(typeAhead(ITEMS, 0, 's')).toBe(-1)
    expect(typeAhead(ITEMS, 0, 'f')).toBe(0)
    expect(typeAhead(ITEMS, 0, 'zz')).toBe(-1)
  })
})

describe('a page of a menu', () => {
  it('is the rows that fit, and the fallback when the list is not laid out', () => {
    expect(rowsFitting(260, 40, 5)).toBe(6)
    expect(rowsFitting(30, 40, 5)).toBe(5)
    expect(rowsFitting(0, 0, 5)).toBe(5)
  })

  it('moves by a page, stopping at the ends, and lands on the nearest item that can be chosen', () => {
    expect(pageStep(ITEMS, 0, 1, 3)).toBe(3)
    expect(pageStep(ITEMS, 0, 1, 2)).toBe(2)
    expect(pageStep(ITEMS, 3, 1, 5)).toBe(3)
    expect(pageStep(ITEMS, 3, -1, 2)).toBe(2)
    expect(pageStep(ITEMS, 2, -1, 9)).toBe(0)
    expect(pageStep([{ id: 'a', label: 'A', disabled: true }], 0, 1, 3)).toBe(-1)
  })
})
