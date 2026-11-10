import { describe, expect, it } from 'vitest'
import { type EnumOption, chosen, isNumber, matching, moved, nameOf, offersNumber, typedNumber } from './enumField'

const OPTIONS: EnumOption[] = [
  { value: 0, label: 'Report only' },
  { value: 1, label: 'Return or land' },
  { value: 2, label: 'Always land' },
  { value: 12, label: 'Brake' },
]

describe('what is a number', () => {
  it.each(['7', '-1', '2.5', ' 3 '])('%j is', text => {
    expect(isNumber(text)).toBe(true)
  })

  it.each(['', 'a', '1a', '1.', '.5', '--1', '1 2'])('%j is not', text => {
    expect(isNumber(text)).toBe(false)
  })
})

describe('the options that match what was typed', () => {
  it('are all of them when nothing is typed', () => {
    expect(matching(OPTIONS, '')).toEqual(OPTIONS)
    expect(matching(OPTIONS, '   ')).toEqual(OPTIONS)
  })

  it('are those whose name has it in it, whatever the case', () => {
    expect(matching(OPTIONS, 'LAND').map(o => o.value)).toEqual([1, 2])
  })

  it('are those whose number starts with it', () => {
    expect(matching(OPTIONS, '1').map(o => o.value)).toEqual([1, 12])
    expect(matching(OPTIONS, '12').map(o => o.value)).toEqual([12])
  })

  it('are none for text that fits nothing', () => {
    expect(matching(OPTIONS, 'xyz')).toEqual([])
  })
})

describe('a number that has no name', () => {
  it('is offered when it is a number and no option has it', () => {
    expect(offersNumber(OPTIONS, '7')).toBe(true)
    expect(offersNumber(OPTIONS, ' -3 ')).toBe(true)
  })

  it('is not offered for a number that has a name, or for text', () => {
    expect(offersNumber(OPTIONS, '1')).toBe(false)
    expect(offersNumber(OPTIONS, '12')).toBe(false)
    expect(offersNumber(OPTIONS, 'land')).toBe(false)
  })

  it('has its name looked up by the number, and none for a number with no name', () => {
    expect(nameOf(OPTIONS, 2)).toBe('Always land')
    expect(nameOf(OPTIONS, 7)).toBeUndefined()
  })
})

describe('what Enter takes', () => {
  it('is the number that was typed, if it is one', () => {
    expect(typedNumber('9')).toBe(9)
    expect(typedNumber(' -2.5 ')).toBe(-2.5)
    expect(typedNumber('x')).toBeUndefined()
    expect(typedNumber(null)).toBeUndefined()
  })

  it('is the highlighted row first, then a typed number, then the only row', () => {
    expect(chosen(OPTIONS, 2, '9')).toBe(2)
    expect(chosen(OPTIONS, -1, '9')).toBe(9)
    expect(chosen([OPTIONS[3] as EnumOption], -1, 'bra')).toBe(12)
  })

  it('is nothing when there is nothing to take', () => {
    expect(chosen(OPTIONS, -1, null)).toBeUndefined()
    expect(chosen(OPTIONS, -1, 'land')).toBeUndefined()
    expect(chosen([], -1, 'xyz')).toBeUndefined()
  })
})

describe('the arrow keys', () => {
  it('move down and up one, and stop at the ends', () => {
    expect(moved(-1, 3, 'ArrowDown')).toBe(0)
    expect(moved(1, 3, 'ArrowDown')).toBe(2)
    expect(moved(2, 3, 'ArrowDown')).toBe(2)
    expect(moved(2, 3, 'ArrowUp')).toBe(1)
    expect(moved(0, 3, 'ArrowUp')).toBe(0)
    expect(moved(-1, 3, 'ArrowUp')).toBe(0)
  })

  it('move a page with Page Down and Page Up, and stop at the ends', () => {
    expect(moved(-1, 30, 'PageDown', 7)).toBe(6)
    expect(moved(10, 30, 'PageDown', 7)).toBe(17)
    expect(moved(28, 30, 'PageDown', 7)).toBe(29)
    expect(moved(10, 30, 'PageUp', 7)).toBe(3)
    expect(moved(2, 30, 'PageUp', 7)).toBe(0)
    expect(moved(5, 30, 'Home', 7)).toBe(5)
  })
})
