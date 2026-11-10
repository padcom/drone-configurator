import { expect, it } from 'vitest'
import { FALLBACK_ROWS, OVERSCAN, movedRow, pageRows, scrollToRow, windowOf } from './rowWindow'

const VIEW = { scrolled: 440, height: 440 + 44, header: 44, rowPx: 44 }

it('moves by a row, a page, or to the ends, and stays inside the list', () => {
  expect([movedRow('ArrowDown', 3, 10, 5), movedRow('ArrowUp', 3, 10, 5)]).toEqual([4, 2])
  expect([movedRow('PageDown', 3, 10, 5), movedRow('PageUp', 3, 10, 5)]).toEqual([8, 0])
  expect([movedRow('Home', 3, 10, 5), movedRow('End', 3, 10, 5)]).toEqual([0, 9])
  expect([movedRow('ArrowDown', 9, 10, 5), movedRow('ArrowUp', 0, 10, 5), movedRow('PageDown', 8, 10, 5)]).toEqual([9, 0, 9])
  // Nothing selected yet (-1): Down gives the first row.
  expect(movedRow('ArrowDown', -1, 10, 5)).toBe(0)
  expect([movedRow('a', 3, 10, 5), movedRow('End', 0, 0, 5)]).toEqual([-1, -1])
})

it('has a page of the rows that are fully in view, and one at least', () => {
  expect(pageRows(VIEW)).toBe(10)
  expect(pageRows({ ...VIEW, height: 0 })).toBe(1)
})

it('scrolls just far enough to show a row, and not at all when it is shown', () => {
  // The box shows rows 10 to 19 (the header covers the top 44 px).
  expect(scrollToRow(12, VIEW)).toBe(440)
  expect(scrollToRow(5, VIEW)).toBe(5 * 44)
  expect(scrollToRow(25, VIEW)).toBe(26 * 44 - 440)
})

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
