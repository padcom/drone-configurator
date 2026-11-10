import { expect, it } from 'vitest'
import { FALLBACK_ROWS, OVERSCAN, windowOf } from './rowWindow'

it('draws the rows in view and a few more each side', () => {
  // 440 px of 44 px rows: 10 rows and a part of one, scrolled to row 100.
  expect(windowOf(1400, 4400, 440, 44)).toEqual({ from: 100 - OVERSCAN, to: 100 - OVERSCAN + 11 + 2 * OVERSCAN })
})

it('starts at the first row at the top, and ends at the last row at the bottom', () => {
  expect(windowOf(1400, 0, 440, 44).from).toBe(0)
  expect(windowOf(1400, 0, 440, 44).to).toBe(11 + 2 * OVERSCAN)
  // Scrolled as far as it goes: (1400 rows - the ones in view) x 44 px.
  expect(windowOf(1400, 1400 * 44 - 440, 440, 44).to).toBe(1400)
})

it('draws a screenful that is more than enough when the height is not known', () => {
  expect(windowOf(1400, 0, 0, 44)).toEqual({ from: 0, to: FALLBACK_ROWS + 2 * OVERSCAN })
})

it('draws what there is of a short list, and nothing of an empty one', () => {
  expect(windowOf(12, 0, 440, 44)).toEqual({ from: 0, to: 12 })
  expect(windowOf(0, 0, 440, 44)).toEqual({ from: 0, to: 0 })
  // A scroll position past the end (the list got shorter): no rows, not a negative window.
  expect(windowOf(5, 9000, 440, 44)).toEqual({ from: 5, to: 5 })
})
