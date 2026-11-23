// The rules of the kit's data table, from plain values (no DOM): the columns, how rows are sorted and filtered, how a column is
// resized, and what a key does. The component (components/ui/DataTable.vue) only draws what these say.

/** The height of a row (px): the kit's one control height. */
export const ROW_PX = 44

/** The height of the header (px). */
export const HEAD_PX = 44

/** The width a column has when its definition says none (px). */
export const DEFAULT_WIDTH = 120

/** The least a column can be dragged to (px). */
export const MIN_WIDTH = 48

/** The most a column can be dragged to (px). */
export const MAX_WIDTH = 800

/** How far an arrow key moves a column's edge (px). */
export const NUDGE_PX = 8

/** How far a Shift arrow moves it (px). */
export const BIG_NUDGE_PX = 32

/** A column of the table. `Row` is what a row is. */
export interface Column<Row> {
  /** Names the column in the sort and in the cell slots. */
  id: string
  /** The words in the header (already in the language of the page). */
  header: string
  /** Its width to begin with (px). */
  width?: number
  /** The least width it can have (px). */
  min?: number
  /** Whether a click on the header sorts by it (false: not sortable). */
  sortable?: boolean
  /** Whether its edge can be dragged (false: it cannot). */
  resizable?: boolean
  /** Whether a cell of it can be edited: for every row, or by the row (a cell a row has nothing in is not). */
  editable?: boolean | ((row: Row) => boolean)
  /** Its cells name their rows (a screen reader says it with the row's other cells): `rowheader`, not `gridcell`. */
  rowHeader?: boolean
  /** Which side the text of its cells is on. */
  align?: 'start' | 'end'
  /**
   * What a cell shows, sorts by and starts an edit with.
   *
   * @param row the row
   * @returns the value
   */
  value(row: Row): string | number
  /**
   * How two rows compare, where the values do not say it (the default compares the values).
   *
   * @param a one row
   * @param b the other
   * @returns below zero when `a` is first, above zero when `b` is, else zero
   */
  compare?(a: Row, b: Row): number
}

/**
 * Whether a cell can be edited.
 *
 * @param column the cell's column (undefined: there is none)
 * @param row the cell's row (undefined: there is none)
 * @returns true when the column says so, for every row or for this one
 */
export function isEditable<Row>(column: Column<Row> | undefined, row: Row | undefined): boolean {
  const editable = column?.editable

  return typeof editable === 'function' ? row !== undefined && editable(row) : editable === true
}

/** The way a sort goes. */
export type Direction = 'asc' | 'desc'

/** What the rows are sorted by. */
export interface Sort {
  /** The column's id. */
  column: string
  /** Which way. */
  direction: Direction
}

/** What a screen reader is told of a sorted column. */
export type AriaSort = 'ascending' | 'descending' | 'none'

const ARIA_SORT: Record<Direction, AriaSort> = { asc: 'ascending', desc: 'descending' }

const ARROWS: Record<Direction, string> = { asc: '▲', desc: '▼' }

const SIGNS: Record<Direction, number> = { asc: 1, desc: -1 }

/**
 * The sort after a click on a header: ascending, then descending, then none (the order the rows came in).
 *
 * @param current the sort now
 * @param column the column that was clicked
 * @returns the next sort, or null for none
 */
export function nextSort(current: Sort | null, column: string): Sort | null {
  if (current === null || current.column !== column) {
    return { column, direction: 'asc' }
  }

  return current.direction === 'asc' ? { column, direction: 'desc' } : null
}

/**
 * What a screen reader is told of a column.
 *
 * @param sort the sort now
 * @param column the column
 * @returns `ascending`, `descending`, `none`, or undefined for a column that is not sortable
 */
export function ariaSortOf<Row>(sort: Sort | null, column: Column<Row>): AriaSort | undefined {
  if (!column.sortable) {
    return undefined
  }

  return sort?.column === column.id ? ARIA_SORT[sort.direction] : 'none'
}

/**
 * The arrow in a header.
 *
 * @param sort the sort now
 * @param column the column
 * @returns the arrow, or nothing for a column the rows are not sorted by
 */
export function arrowOf<Row>(sort: Sort | null, column: Column<Row>): string {
  return sort?.column === column.id ? ARROWS[sort.direction] : ''
}

/**
 * Which of a number and a text comes first: a number.
 *
 * @param value the value
 * @returns 0 for a number, 1 for a text
 */
function rank(value: string | number): number {
  return typeof value === 'number' ? 0 : 1
}

/**
 * How two values compare: numbers by size, anything else by its text with the digits in it taken as numbers ("A2" before "A10"),
 * a number before a text.
 *
 * @param a one value
 * @param b the other
 * @returns below zero when `a` is first, above zero when `b` is, else zero
 */
export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }

  return rank(a) - rank(b) || String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * How two rows compare by a column.
 *
 * @param column the column
 * @returns the comparison: the column's own, else by the values
 */
function comparatorOf<Row>(column: Column<Row>): (a: Row, b: Row) => number {
  return column.compare?.bind(column) ?? ((a, b) => compareValues(column.value(a), column.value(b)))
}

/**
 * The rows in the order a comparison says, stably: rows that are equal stay in the order they came in.
 *
 * @param rows the rows
 * @param compare the comparison
 * @param sign 1 to sort as the comparison says, -1 to reverse it
 * @returns a new list
 */
function ordered<Row>(rows: readonly Row[], compare: (a: Row, b: Row) => number, sign: number): Row[] {
  // (the index breaks a tie, so that the order does not depend on how the engine sorts)
  const keyed = rows.map((row, index) => ({ row, index }))
  keyed.sort((a, b) => sign * compare(a.row, b.row) || a.index - b.index)

  return keyed.map(entry => entry.row)
}

/**
 * The rows in the order a sort says. The rows are not changed: a new list is made, or the same one when there is no sort.
 *
 * @param rows the rows
 * @param columns the columns
 * @param sort what to sort by (null: none)
 * @returns the rows in order
 */
export function sortRows<Row>(rows: readonly Row[], columns: readonly Column<Row>[], sort: Sort | null): readonly Row[] {
  const column = sort === null ? undefined : columns.find(candidate => candidate.id === sort.column)

  if (sort === null || column === undefined) {
    return rows
  }

  return ordered(rows, comparatorOf(column), SIGNS[sort.direction])
}

/**
 * The rows a filter lets through.
 *
 * @param rows the rows
 * @param filter the hook (undefined: all of them)
 * @returns the rows that stay
 */
export function filterRows<Row>(rows: readonly Row[], filter: ((row: Row) => boolean) | undefined): readonly Row[] {
  return filter === undefined ? rows : rows.filter(filter)
}

/**
 * The width a column gets when its edge is dragged or nudged.
 *
 * @param from the width it had (px)
 * @param by how far the edge moved (px, below zero to the left)
 * @param min the least it can have (px)
 * @returns the new width, within the least and the most
 */
export function resizedWidth(from: number, by: number, min: number = MIN_WIDTH): number {
  return Math.min(MAX_WIDTH, Math.max(min, Math.round(from + by)))
}

/**
 * The width a column has now: the one the person gave it, else the one its definition says, else the default.
 *
 * @param column the column
 * @param given the widths the person gave, by column
 * @returns the width (px)
 */
export function widthOf<Row>(column: Column<Row>, given: Readonly<Record<string, number>>): number {
  return given[column.id] ?? column.width ?? DEFAULT_WIDTH
}

/** A cell: the row and the column, from 0. */
export interface Cell {
  /** The row. */
  row: number
  /** The column. */
  col: number
}

/** How big the table is, in cells. */
export interface Grid {
  /** How many rows there are. */
  rows: number
  /** How many columns. */
  cols: number
  /** How many rows a page is. */
  page: number
}

/** A key, as the table reads it. */
export interface Press {
  /** The key. */
  key: string
  /** Whether Control or Command is down. */
  ctrl: boolean
  /** Whether Shift is down. */
  shift: boolean
  /** Whether a cell is being edited (the keys of the field are then the field's, but for these: Enter, Tab and Shift Tab). */
  editing: boolean
}

/**
 * The cell nearest to one that may be outside the table.
 *
 * @param cell the cell
 * @param grid the size of the table
 * @returns the cell, brought inside
 */
function within(cell: Cell, grid: Grid): Cell {
  return { row: Math.min(grid.rows - 1, Math.max(0, cell.row)), col: Math.min(grid.cols - 1, Math.max(0, cell.col)) }
}

/**
 * Tab and Shift Tab: the next and the previous cell, row after row.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param grid the size of the table
 * @returns the cell, or null at the ends (the browser takes the focus out of the table)
 */
function tabbed(press: Press, at: Cell, grid: Grid): Cell | null {
  const to = at.row * grid.cols + at.col + (press.shift ? -1 : 1)

  return to < 0 || to >= grid.rows * grid.cols ? null : { row: Math.floor(to / grid.cols), col: to % grid.cols }
}

/**
 * A key while a cell is edited: Enter goes to the cell below (Shift Enter, above); the rest is the field's.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param grid the size of the table
 * @returns the cell, or null for a key that is the field's
 */
function afterEdit(press: Press, at: Cell, grid: Grid): Cell | null {
  return press.key === 'Enter' ? within({ row: at.row + (press.shift ? -1 : 1), col: at.col }, grid) : null
}

/** Where each key that moves the cursor takes it from a cell (it is then brought inside the table). */
const STEPS: Record<string, (at: Cell, grid: Grid, ctrl: boolean) => Cell> = {
  ArrowDown: at => ({ row: at.row + 1, col: at.col }),
  ArrowUp: at => ({ row: at.row - 1, col: at.col }),
  ArrowRight: at => ({ row: at.row, col: at.col + 1 }),
  ArrowLeft: at => ({ row: at.row, col: at.col - 1 }),
  PageDown: (at, grid) => ({ row: at.row + grid.page, col: at.col }),
  PageUp: (at, grid) => ({ row: at.row - grid.page, col: at.col }),
  Home: (at, _grid, ctrl) => ({ row: ctrl ? 0 : at.row, col: 0 }),
  End: (at, grid, ctrl) => ({ row: ctrl ? grid.rows - 1 : at.row, col: grid.cols - 1 }),
}

/**
 * A key that moves the cursor while no cell is edited.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param grid the size of the table
 * @returns the cell, or null for a key that moves nothing
 */
function moved(press: Press, at: Cell, grid: Grid): Cell | null {
  const step = STEPS[press.key]

  return step === undefined ? null : within(step(at, grid, press.ctrl), grid)
}

/**
 * A key that is not Tab.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param grid the size of the table
 * @returns the cell, or null for a key that moves nothing
 */
function otherKey(press: Press, at: Cell, grid: Grid): Cell | null {
  return press.editing ? afterEdit(press, at, grid) : moved(press, at, grid)
}

/**
 * Where a key takes the cursor. Not editing: the arrows move one cell, Home and End go to the ends of the row (with Control, of
 * the table), Page Up and Page Down move a page, and Tab and Shift Tab go to the next and the previous cell (row after row).
 * Editing: Enter goes to the cell below, Tab and Shift Tab as before. Anything else moves nothing.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param grid the size of the table
 * @returns the cell to go to, or null when the key moves nothing (or would leave the table: Tab at the end is the browser's)
 */
export function nextCell(press: Press, at: Cell, grid: Grid): Cell | null {
  if (grid.rows === 0 || grid.cols === 0) {
    return null
  }

  return press.key === 'Tab' ? tabbed(press, at, grid) : otherKey(press, at, grid)
}

/**
 * Whether a key starts an edit of the cell the cursor is in: Enter and F2, or a character that is typed (it is then the first one
 * of the new text).
 *
 * @param press the key
 * @returns whether it starts an edit
 */
export function startsEdit(press: Pick<Press, 'key' | 'ctrl'>): boolean {
  return !press.ctrl && (press.key === 'Enter' || press.key === 'F2' || press.key.length === 1)
}

/** What the table does with a key. */
export type KeyAction
  = | { kind: 'cancel' }
    | { kind: 'edit', at: Cell, first: string | null }
    | { kind: 'move', to: Cell }

/**
 * The edit a key starts, if it does.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param editable whether the cell can be edited
 * @returns the action, or null
 */
function editAction(press: Press, at: Cell, editable: boolean): KeyAction | null {
  return editable && startsEdit(press) ? { kind: 'edit', at, first: press.key.length === 1 ? press.key : null } : null
}

/**
 * The move a key makes, if it does.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param grid the size of the table
 * @returns the action, or null
 */
function moveAction(press: Press, at: Cell, grid: Grid): KeyAction | null {
  const to = nextCell(press, at, grid)

  return to === null ? null : { kind: 'move', to }
}

/**
 * What the table does with a key.
 *
 * @param press the key
 * @param at the cell the cursor is in
 * @param grid the size of the table
 * @param editable whether the cell can be edited
 * @returns the action, or null for a key that is not the table's (a field's, the browser's)
 */
export function actionFor(press: Press, at: Cell, grid: Grid, editable: boolean): KeyAction | null {
  if (press.editing) {
    return press.key === 'Escape' ? { kind: 'cancel' } : moveAction(press, at, grid)
  }

  return editAction(press, at, editable) ?? moveAction(press, at, grid)
}

/** Whether the caret of the field in a cell is at its start and at its end (a cell that has no text field is at both). */
export interface Edges {
  /** At the start. */
  start: boolean
  /** At the end. */
  end: boolean
}

/** Where each key goes from a cell of FIELDS (a key with Control is named with it), before it is kept within the table. */
const FIELD_GOES: Record<string, (at: Cell, grid: Grid, edges: Edges) => Cell> = {
  'ArrowDown': at => ({ ...at, row: at.row + 1 }),
  'Enter': at => ({ ...at, row: at.row + 1 }),
  'ArrowUp': at => ({ ...at, row: at.row - 1 }),
  'PageDown': (at, grid) => ({ ...at, row: at.row + grid.page }),
  'PageUp': (at, grid) => ({ ...at, row: at.row - grid.page }),
  'Control+Home': at => ({ ...at, row: 0 }),
  'Control+End': (at, grid) => ({ ...at, row: grid.rows - 1 }),
  // (the caret moves in the field first: the cell changes only from its edge)
  'ArrowLeft': (at, _grid, edges) => ({ ...at, col: edges.start ? at.col - 1 : at.col }),
  'ArrowRight': (at, _grid, edges) => ({ ...at, col: edges.end ? at.col + 1 : at.col }),
}

/**
 * The move of a key in a table of fields.
 *
 * @param press the key
 * @returns where it goes, or undefined for a key that is not the table's
 */
function fieldMove(press: Pick<Press, 'key' | 'ctrl' | 'shift'>): ((at: Cell, grid: Grid, edges: Edges) => Cell) | undefined {
  const name = `${press.ctrl ? 'Control+' : ''}${press.key}`

  return press.shift ? undefined : FIELD_GOES[name]
}

/**
 * A cell that is another than where the key was pressed.
 *
 * @param at where it was pressed
 * @param to where it goes
 * @returns the cell, or null when it is the same one (the table ends there)
 */
function otherCell(at: Cell, to: Cell): Cell | null {
  return to.row === at.row && to.col === at.col ? null : to
}

/**
 * Where a key takes the cursor in a table whose cells ARE fields (the caller's: a number to type, a choice), with no edit to
 * begin: up and down (and Enter, down) between rows, Page Up and Page Down a page, Control Home and End to the first and the
 * last row, left and right between columns where the caret of the field is at its edge (else the caret moves). Home and End
 * alone, Tab and a key with Alt or Shift are the field's or the browser's (the table is one tab stop).
 *
 * @param press the key (`shift` and `editing` are not the table's here: a key with Shift is the field's)
 * @param at the cell it is pressed in
 * @param grid the size of the table
 * @param edges whether the caret is at the start and at the end of the field
 * @returns the cell to go to, or null when the key moves nothing (it is not one that moves, or the table ends there)
 */
export function nextFieldCell(press: Pick<Press, 'key' | 'ctrl' | 'shift'>, at: Cell, grid: Grid, edges: Edges): Cell | null {
  const goes = fieldMove(press)

  return goes ? otherCell(at, within(goes(at, grid, edges), grid)) : null
}

/**
 * Whether a row that has the cursor must be drawn though it is out of view (it holds the focus: a scroll must not take it away).
 *
 * @param index the row's place in the table (-1: there is none)
 * @param from the first row that is drawn
 * @param to one past the last
 * @returns true when it is out of the drawn rows
 */
export function isOutside(index: number, from: number, to: number): boolean {
  return index >= 0 && (index < from || index >= to)
}
