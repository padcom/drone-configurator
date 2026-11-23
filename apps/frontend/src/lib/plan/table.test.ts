// The cells of the Table tool: which an item has, what they hold and what they write (the form's own fields), and which of the
// plan's problems are a cell's and which are the row's.
import { describe, expect, it } from 'vitest'
import { definitionOf, freshItem } from './catalog'
import { type Plan, type PlanItem, emptyPlan } from './model'
import { EDIT_COLUMNS, type EditColumn, cellOf, problemsOfCell, problemsOfRow } from './table'
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
