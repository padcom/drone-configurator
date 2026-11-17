// The cells of the Table tool: which an item has, what they hold and what they write (the form's own fields), and which of the
// plan's problems are a cell's and which are the row's.
import { describe, expect, it } from 'vitest'
import { definitionOf, freshItem } from './catalog'
import { type Plan, type PlanItem, emptyPlan } from './model'
import {
  EDIT_COLUMNS, type EditColumn, HEAD_PX, OVERSCAN_ROWS, type Press, ROW_PX, cellOf, nextCell, problemsOfCell, problemsOfRow,
  rowsInView, scrollFor,
} from './table'
import { problemsOf } from './validate'

/**
 * An item of a command, as the plan's defaults and the catalog make it.
 *
 * @param command the MAV_CMD
 * @param patch what differs
 * @returns the item
 */
function itemOf(command: number, patch: Partial<PlanItem> = {}): PlanItem {
  return { ...freshItem(definitionOf(command)!, emptyPlan(), 1), ...patch }
}

/**
 * The columns an item has a cell in.
 *
 * @param item the item
 * @returns their names
 */
function columnsOf(item: PlanItem): string[] {
  return EDIT_COLUMNS.filter(column => cellOf(item, column) !== null)
}

/**
 * A plan of items.
 *
 * @param items the items (ids are given in order)
 * @returns the plan
 */
function planOf(...items: PlanItem[]): Plan {
  return { ...emptyPlan(), items: items.map((item, index) => ({ ...item, id: index + 1 })) }
}

describe('which cells an item has', () => {
  it('has a place, an altitude, its frame and the fields of the command, and no more', () => {
    expect(columnsOf(itemOf(16))).toEqual(['lat', 'lon', 'alt', 'frame', 's1'])
    expect(columnsOf(itemOf(18))).toEqual(['lat', 'lon', 'alt', 'frame', 's1', 's2', 's3', 's4'])
  })

  it('has none of the place and the altitude for a command that has neither, and only its fields', () => {
    expect(columnsOf(itemOf(178))).toEqual(['s1', 's2', 's3'])
    expect(columnsOf(itemOf(20))).toEqual([])
  })

  it('has no frame where the vehicle keeps none (set home), and has the rest', () => {
    expect(columnsOf(itemOf(179))).toEqual(['lat', 'lon', 'alt', 's1'])
  })

  it('has no cell for a command the page does not edit', () => {
    expect(columnsOf(itemOf(16, { command: 999 }))).toEqual([])
  })
})

describe('what a cell holds and writes', () => {
  it('holds a number and writes it where the form does', () => {
    const item = itemOf(16, { lat: 52.5, alt: 30 })

    expect(cellOf(item, 'lat')).toMatchObject({ kind: 'number', value: 52.5 })
    expect(cellOf(item, 'alt')!.write(45)).toEqual({ alt: 45 })
    expect(cellOf(item, 'lon')!.write(null)).toEqual({ lon: null })
    expect(cellOf(item, 's1')).toMatchObject({ kind: 'number', unit: 's', fieldId: 'holdTime' })
  })

  it('is a choice for the frame, and writes the frame', () => {
    const cell = cellOf(itemOf(16), 'frame')!

    expect(cell.kind).toBe('choice')
    expect(cell.choices?.map(choice => choice.value)).toEqual([3, 0, 10])
    expect(cell.write(0)).toEqual({ frame: 0 })
  })

  it('writes the radius of a loiter keeping its direction, as the form does', () => {
    const item = itemOf(18, { p3: -20 })

    expect(cellOf(item, 's2')).toMatchObject({ value: 20, fieldId: 'radius' })
    expect(cellOf(item, 's2')!.write(30)).toEqual({ p3: -30 })
    expect(cellOf(item, 's3')).toMatchObject({ kind: 'choice', value: -1, fieldId: 'direction' })
    expect(cellOf(item, 's3')!.write(1)).toEqual({ p3: 20 })
  })
})

const press = (key: string, extra: Partial<Press> = {}): Press => ({ key, ctrl: false, other: false, ...extra })
const both = { start: true, end: true }
const at = { row: 5, col: 3 }

describe('where a key goes in the grid, between rows', () => {
  it('goes up, down and with Enter down a row, and Page Up and Page Down ten, and keeps the column', () => {
    expect(nextCell(press('ArrowDown'), at, 100, both)).toEqual({ row: 6, col: 3 })
    expect(nextCell(press('Enter'), at, 100, both)).toEqual({ row: 6, col: 3 })
    expect(nextCell(press('ArrowUp'), at, 100, both)).toEqual({ row: 4, col: 3 })
    expect(nextCell(press('PageDown'), at, 100, both)).toEqual({ row: 15, col: 3 })
    expect(nextCell(press('PageUp'), at, 100, both)).toEqual({ row: 0, col: 3 })
  })

  it('goes to the first and the last row with Control and Home or End, and leaves Home and End alone without it', () => {
    expect(nextCell(press('Home', { ctrl: true }), at, 100, both)).toEqual({ row: 0, col: 3 })
    expect(nextCell(press('End', { ctrl: true }), at, 100, both)).toEqual({ row: 99, col: 3 })
    expect(nextCell(press('Home'), at, 100, both)).toBeNull()
    expect(nextCell(press('End'), at, 100, both)).toBeNull()
  })
})

describe('where a key goes in the grid, between columns and at the ends', () => {
  it('goes left and right only where the caret is at the edge of the field, and stays within the columns', () => {
    expect(nextCell(press('ArrowRight'), at, 100, { start: false, end: true })).toEqual({ row: 5, col: 4 })
    expect(nextCell(press('ArrowRight'), at, 100, { start: true, end: false })).toBeNull()
    expect(nextCell(press('ArrowLeft'), at, 100, { start: true, end: false })).toEqual({ row: 5, col: 2 })
    expect(nextCell(press('ArrowLeft'), at, 100, { start: false, end: true })).toBeNull()
    expect(nextCell(press('ArrowLeft'), { row: 0, col: 0 }, 100, both)).toBeNull()
    expect(nextCell(press('ArrowRight'), { row: 0, col: EDIT_COLUMNS.length - 1 }, 100, both)).toBeNull()
  })

  it('stays at the ends of the grid, and leaves the keys that are the browser\'s (Alt, Shift) and the others', () => {
    expect(nextCell(press('ArrowUp'), { row: 0, col: 1 }, 100, both)).toBeNull()
    expect(nextCell(press('ArrowDown'), { row: 99, col: 1 }, 100, both)).toBeNull()
    expect(nextCell(press('ArrowDown', { other: true }), at, 100, both)).toBeNull()
    expect(nextCell(press('a'), at, 100, both)).toBeNull()
  })
})

describe('which rows are drawn', () => {
  it('are the rows in view and a few beyond, however many there are', () => {
    // (a 520 px area less the 44 px header shows 476 px of rows: ten of 52 px, and the overscan on each side)
    expect(rowsInView(0, 520, 1000)).toEqual({ first: 0, end: Math.ceil(476 / ROW_PX) + OVERSCAN_ROWS })
    const middle = rowsInView(26_000, 520, 1000)

    expect(middle.first).toBe(500 - OVERSCAN_ROWS)
    expect(middle.end - middle.first).toBeLessThan(30)
  })

  it('are none for an empty plan, and never go past the last row or before the first', () => {
    expect(rowsInView(0, 520, 0)).toEqual({ first: 0, end: 0 })
    expect(rowsInView(52 * 998, 520, 1000).end).toBe(1000)
    expect(rowsInView(-40, 520, 1000).first).toBe(0)
  })

  it('scrolls the least that shows a row, and not at all when it is shown', () => {
    expect(scrollFor(3, 0, 520)).toBe(0)
    expect(scrollFor(0, 520, 520)).toBe(0)
    // a row below the view: its bottom at the bottom of the room the rows have
    expect(scrollFor(20, 0, 520)).toBe(21 * ROW_PX - (520 - HEAD_PX))
    expect(scrollFor(8, 0, 520)).toBe(0)
    expect(scrollFor(9, 0, 520)).toBe(10 * ROW_PX - (520 - HEAD_PX))
  })
})

describe('which problems are a cell\'s', () => {
  it('names the place cells for a place not set, the altitude cell for one too high, and a field by its id', () => {
    const waypoint = itemOf(16, { lat: null, lon: null, alt: 20000, p1: -5 })
    const problems = problemsOf(planOf(waypoint)).filter(problem => problem.itemId === 1)
    const of = (column: EditColumn): string[] => problemsOfCell(problems, cellOf(waypoint, column)!).map(problem => problem.key)

    expect(of('lat')).toContain('noPlace')
    expect(of('lon')).toContain('noPlace')
    expect(of('alt')).toContain('altHigh')
    expect(of('s1').length).toBeGreaterThan(0)
    expect(of('frame')).toEqual([])
  })
})

describe('which problems are the row\'s', () => {
  it('leaves to the row what no cell takes: the yaw, which has no cell', () => {
    // (a loiter of turns must have a yaw; its fourth parameter is the exit, whose cell is about the exit and not the yaw)
    const loiter = itemOf(18, { lat: 52, lon: 21, p4: null })
    const plan = planOf(loiter)
    const mine = problemsOf(plan).filter(problem => problem.itemId === 1)

    expect(mine.map(problem => problem.params?.field)).toContain('p4')
    expect(problemsOfRow(plan.items[0]!, mine).map(problem => problem.params?.field)).toEqual(['p4'])
  })

  it('gives the target of a jump to a cell, not to the row', () => {
    const jump = itemOf(177, { p1: 9 })
    const plan = planOf(jump)
    const mine = problemsOf(plan).filter(problem => problem.itemId === 1)

    expect(mine.map(problem => problem.key)).toContain('jumpTarget')
    expect(problemsOfCell(mine, cellOf(plan.items[0]!, 's1')!).map(problem => problem.key)).toEqual(['jumpTarget'])
    expect(problemsOfRow(plan.items[0]!, mine)).toEqual([])
  })
})
