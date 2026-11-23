// The rules of the data table from plain values: the sort and its order, the filter, the width of a column, and where a key takes
// the cursor.
import { describe, expect, it } from 'vitest'
import {
  type Cell,
  type Column,
  MAX_WIDTH,
  MIN_WIDTH,
  type Press,
  actionFor,
  ariaSortOf,
  arrowOf,
  compareValues,
  filterRows,
  isOutside,
  nextCell,
  nextSort,
  resizedWidth,
  sortRows,
  startsEdit,
  widthOf,
} from './dataTable'

interface Row {
  name: string
  value: number
}

const COLUMNS: Column<Row>[] = [
  { id: 'name', header: 'Name', value: row => row.name, sortable: true },
  { id: 'value', header: 'Value', value: row => row.value, sortable: true, width: 90 },
]
const ROWS: Row[] = [
  { name: 'B10', value: 2 },
  { name: 'B2', value: 2 },
  { name: 'A1', value: 9 },
  { name: 'C', value: 1 },
]
const GRID = { rows: 5, cols: 3, page: 2 }

/**
 * A key.
 *
 * @param key the key
 * @param more what else is down or going on
 * @returns the press
 */
function press(key: string, more: Partial<Press> = {}): Press {
  return { key, ctrl: false, shift: false, editing: false, ...more }
}

/**
 * Where a key takes the cursor, in a table of 5 rows and 3 columns with a page of 2 rows.
 *
 * @param p the key
 * @param at the cell the cursor is in
 * @returns the cell, as "row,column", or "none"
 */
function goes(p: Press, at: Cell): string {
  const to = nextCell(p, at, GRID)

  return to === null ? 'none' : `${to.row},${to.col}`
}

/**
 * The names of the rows a sort puts in order.
 *
 * @param column the column to sort by
 * @param direction which way
 * @returns the names
 */
function sortedBy(column: string, direction: 'asc' | 'desc'): string[] {
  return sortRows(ROWS, COLUMNS, { column, direction }).map(row => row.name)
}

describe('the sort of a column', () => {
  it('goes ascending, descending, none, and begins again on another column', () => {
    const asc = nextSort(null, 'name')
    const desc = nextSort(asc, 'name')

    expect(asc).toEqual({ column: 'name', direction: 'asc' })
    expect(desc).toEqual({ column: 'name', direction: 'desc' })
    expect(nextSort(desc, 'name')).toBeNull()
    expect(nextSort(desc, 'value')).toEqual({ column: 'value', direction: 'asc' })
  })

  it('is told to a screen reader and drawn as an arrow', () => {
    const asc = { column: 'name', direction: 'asc' } as const
    const [name, value] = COLUMNS as [Column<Row>, Column<Row>]
    const other = { ...value, sortable: false }

    expect([ariaSortOf(asc, name), ariaSortOf(asc, value), ariaSortOf(asc, other)]).toEqual(['ascending', 'none', undefined])
    expect(ariaSortOf({ column: 'name', direction: 'desc' }, name)).toBe('descending')
    expect([arrowOf(asc, name), arrowOf(asc, value), arrowOf(null, name)]).toEqual(['▲', '', ''])
  })
})

describe('comparing values', () => {
  it('compares numbers by size, texts with their digits as numbers, and a number before a text', () => {
    expect(compareValues(2, 10)).toBeLessThan(0)
    expect(compareValues('B2', 'B10')).toBeLessThan(0)
    expect(compareValues('b', 'A')).toBeGreaterThan(0)
    expect(compareValues('a', 'A')).toBe(0)
    expect(compareValues(5, 'A')).toBeLessThan(0)
    expect(compareValues('A', 5)).toBeGreaterThan(0)
  })
})

describe('sorting rows', () => {
  it('makes a copy, and leaves the rows alone with no sort or a column that is not there', () => {
    expect(sortRows(ROWS, COLUMNS, null)).toBe(ROWS)
    expect(sortRows(ROWS, COLUMNS, { column: 'nothing', direction: 'asc' })).toBe(ROWS)
    expect(sortedBy('name', 'asc')).toEqual(['A1', 'B2', 'B10', 'C'])
    expect(ROWS.map(row => row.name)).toEqual(['B10', 'B2', 'A1', 'C'])
  })

  it('is stable: equal values stay in the order they came in, ascending and descending', () => {
    expect(sortedBy('value', 'asc')).toEqual(['C', 'B10', 'B2', 'A1'])
    expect(sortedBy('value', 'desc')).toEqual(['A1', 'B10', 'B2', 'C'])
  })

  it('uses the column\'s own comparison when it has one', () => {
    const backwards: Column<Row>[] = [{ ...COLUMNS[0] as Column<Row>, compare: (a, b) => b.name.length - a.name.length }]

    expect(sortRows(ROWS, backwards, { column: 'name', direction: 'asc' }).map(row => row.name)).toEqual(['B10', 'B2', 'A1', 'C'])
  })
})

describe('the filter', () => {
  it('lets through the rows the hook likes, and all of them with none', () => {
    expect(filterRows(ROWS, undefined)).toBe(ROWS)
    expect(filterRows(ROWS, row => row.value === 2).map(row => row.name)).toEqual(['B10', 'B2'])
  })
})

describe('the width of a column', () => {
  it('is what the person gave, else the definition\'s, else the default', () => {
    expect(widthOf(COLUMNS[1] as Column<Row>, { value: 200 })).toBe(200)
    expect(widthOf(COLUMNS[1] as Column<Row>, {})).toBe(90)
    expect(widthOf(COLUMNS[0] as Column<Row>, {})).toBe(120)
  })

  it('changes by what the edge moved, within the least and the most', () => {
    expect(resizedWidth(100, 20)).toBe(120)
    expect(resizedWidth(100, -500)).toBe(MIN_WIDTH)
    expect(resizedWidth(100, -90, 80)).toBe(80)
    expect(resizedWidth(700, 500)).toBe(MAX_WIDTH)
    expect(resizedWidth(100, 0.4)).toBe(100)
  })
})

describe('the arrow keys', () => {
  it('move one cell, and stop at the edges', () => {
    expect(goes(press('ArrowDown'), { row: 1, col: 1 })).toBe('2,1')
    expect(goes(press('ArrowUp'), { row: 1, col: 1 })).toBe('0,1')
    expect(goes(press('ArrowRight'), { row: 1, col: 1 })).toBe('1,2')
    expect(goes(press('ArrowLeft'), { row: 1, col: 1 })).toBe('1,0')
    expect(goes(press('ArrowUp'), { row: 0, col: 0 })).toBe('0,0')
    expect(goes(press('ArrowDown'), { row: 4, col: 2 })).toBe('4,2')
  })
})

describe('Home, End and the pages', () => {
  it('go to the ends of the row, and with Control of the table', () => {
    expect(goes(press('Home'), { row: 2, col: 2 })).toBe('2,0')
    expect(goes(press('End'), { row: 2, col: 0 })).toBe('2,2')
    expect(goes(press('Home', { ctrl: true }), { row: 2, col: 2 })).toBe('0,0')
    expect(goes(press('End', { ctrl: true }), { row: 2, col: 0 })).toBe('4,2')
  })

  it('move a page with Page Up and Page Down', () => {
    expect(goes(press('PageDown'), { row: 0, col: 1 })).toBe('2,1')
    expect(goes(press('PageDown'), { row: 3, col: 1 })).toBe('4,1')
    expect(goes(press('PageUp'), { row: 3, col: 1 })).toBe('1,1')
    expect(goes(press('PageUp'), { row: 1, col: 1 })).toBe('0,1')
  })
})

describe('Tab', () => {
  it('goes from cell to cell, row after row, and leaves the table at the ends', () => {
    expect(goes(press('Tab'), { row: 1, col: 0 })).toBe('1,1')
    expect(goes(press('Tab'), { row: 1, col: 2 })).toBe('2,0')
    expect(goes(press('Tab', { shift: true }), { row: 1, col: 0 })).toBe('0,2')
    expect(goes(press('Tab'), { row: 4, col: 2 })).toBe('none')
    expect(goes(press('Tab', { shift: true }), { row: 0, col: 0 })).toBe('none')
  })
})

describe('the keys while a cell is edited', () => {
  it('are the field\'s, but for Enter and Tab', () => {
    const editing = { editing: true }

    expect(goes(press('ArrowLeft', editing), { row: 1, col: 1 })).toBe('none')
    expect(goes(press('Home', editing), { row: 1, col: 1 })).toBe('none')
    expect(goes(press('Enter', editing), { row: 1, col: 1 })).toBe('2,1')
    expect(goes(press('Enter', { editing: true, shift: true }), { row: 1, col: 1 })).toBe('0,1')
    expect(goes(press('Enter', editing), { row: 4, col: 1 })).toBe('4,1')
    expect(goes(press('Tab', editing), { row: 1, col: 1 })).toBe('1,2')
  })
})

describe('a key that moves nothing', () => {
  it('is any other, or any in a table with no cells', () => {
    expect(goes(press('x'), { row: 1, col: 1 })).toBe('none')
    expect(goes(press('Escape'), { row: 1, col: 1 })).toBe('none')
    expect(nextCell(press('ArrowDown'), { row: 0, col: 0 }, { rows: 0, cols: 3, page: 2 })).toBeNull()
    expect(nextCell(press('ArrowDown'), { row: 0, col: 0 }, { rows: 3, cols: 0, page: 2 })).toBeNull()
  })
})

describe('starting an edit', () => {
  it('is Enter, F2 or a character, and not Control or another key', () => {
    expect(startsEdit({ key: 'Enter', ctrl: false })).toBe(true)
    expect(startsEdit({ key: 'F2', ctrl: false })).toBe(true)
    expect(startsEdit({ key: '7', ctrl: false })).toBe(true)
    expect(startsEdit({ key: 'c', ctrl: true })).toBe(false)
    expect(startsEdit({ key: 'ArrowDown', ctrl: false })).toBe(false)
    expect(startsEdit({ key: 'Escape', ctrl: false })).toBe(false)
  })
})

describe('what the table does with a key', () => {
  it('starts an edit in a cell that can be edited, with the character typed as its first', () => {
    const at = { row: 1, col: 1 }

    expect(actionFor(press('Enter'), at, GRID, true)).toEqual({ kind: 'edit', at, first: null })
    expect(actionFor(press('Z'), at, GRID, true)).toEqual({ kind: 'edit', at, first: 'Z' })
    expect(actionFor(press('Z'), at, GRID, false)).toBeNull()
    expect(actionFor(press('Enter'), at, GRID, false)).toBeNull()
  })

  it('cancels an edit with Escape, and moves with the keys that move', () => {
    const at = { row: 1, col: 1 }

    expect(actionFor(press('Escape', { editing: true }), at, GRID, true)).toEqual({ kind: 'cancel' })
    expect(actionFor(press('ArrowDown'), at, GRID, true)).toEqual({ kind: 'move', to: { row: 2, col: 1 } })
    expect(actionFor(press('q', { editing: true }), at, GRID, true)).toBeNull()
  })
})

describe('a row that has the cursor', () => {
  it('is drawn though it is out of view, and not when it is in view or there is none', () => {
    const outside = [0, 15, 25, -1].map(index => isOutside(index, 10, 20))

    expect(outside).toEqual([true, false, true, false])
  })
})
