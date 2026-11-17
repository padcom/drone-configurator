// The Table tool of the Plan page: what a cell of an item is, for the columns that can be edited. It is the same model as the
// form has (the catalog's fields read and write the same parameters, with the same rules), so what is typed in a cell is the edit
// the form would make, and the plan's problems say which cell is wrong by the same keys and field ids.
import { type Field, type CommandDef, definitionOf, keepsFrame } from './catalog'
import { FRAME_ABOVE_HOME, FRAME_ABSOLUTE, FRAME_TERRAIN, type PlanItem } from './model'
import type { Problem } from './validate'

/** The columns that can be edited: the place, the altitude and its frame, and the (up to four) fields of the item's command. */
export type EditColumn = 'lat' | 'lon' | 'alt' | 'frame' | 's1' | 's2' | 's3' | 's4'

/** The editable columns, left to right. */
export const EDIT_COLUMNS: readonly EditColumn[] = ['lat', 'lon', 'alt', 'frame', 's1', 's2', 's3', 's4']

/** How tall a row is (px): the table draws only the rows that are in view, so every row is the same height. */
export const ROW_PX = 52

/** How tall the header is (px): it stays at the top of the area while the rows scroll under it. */
export const HEAD_PX = 44

/** How many rows are drawn beyond the ones in view, on each side (so that a scroll shows no gap before the next draw). */
export const OVERSCAN_ROWS = 6

/** The rows that are drawn: from `first` up to, not including, `end`. */
export interface Rows {
  /** The first row (from 0). */
  first: number
  /** One past the last. */
  end: number
}

/**
 * The rows to draw for a scroll position: those in view and a few beyond.
 *
 * @param scrollTop how far the area is scrolled (px)
 * @param height how tall the area is (px), header included
 * @param count how many rows there are
 * @returns the rows
 */
export function rowsInView(scrollTop: number, height: number, count: number): Rows {
  const first = Math.floor(Math.max(scrollTop, 0) / ROW_PX) - OVERSCAN_ROWS
  const end = Math.ceil((Math.max(scrollTop, 0) + Math.max(height - HEAD_PX, 0)) / ROW_PX) + OVERSCAN_ROWS

  return { first: Math.max(first, 0), end: Math.min(end, count) }
}

/**
 * Where to scroll so that a row is in view: not at all when it is, the least that shows it when it is not.
 *
 * @param row the row (from 0)
 * @param scrollTop how far the area is scrolled (px)
 * @param height how tall the area is (px), header included
 * @returns the scroll position (px)
 */
export function scrollFor(row: number, scrollTop: number, height: number): number {
  const top = row * ROW_PX
  const room = Math.max(height - HEAD_PX, ROW_PX)

  if (top < scrollTop) {
    return top
  }

  return top + ROW_PX > scrollTop + room ? top + ROW_PX - room : scrollTop
}

/** A cell of the grid: the row (from 0) and the column (the index into `EDIT_COLUMNS`). */
export interface Where {
  /** The row. */
  row: number
  /** The column. */
  col: number
}

/** The key that moved, and what the person holds down with it. */
export interface Press {
  /** The key. */
  key: string
  /** Control or Command is down (Home and End go to the first and the last row with it). */
  ctrl: boolean
  /** Alt or Shift is down: the browser's (a list opens with Alt and Down, text is selected with Shift): not the grid's. */
  other: boolean
}

/** Whether the caret of a field is at its start and at its end (a cell that is no text field is at both). */
export interface Edges {
  /** At the start. */
  start: boolean
  /** At the end. */
  end: boolean
}

/** How many rows Page Up and Page Down go. */
export const PAGE_ROWS = 10

/** Where each key goes from a cell (a key with Control is named with it), before it is kept within the grid. */
const GOES: Record<string, (at: Where, rows: number, edges: Edges) => Where> = {
  'ArrowDown': at => ({ ...at, row: at.row + 1 }),
  'Enter': at => ({ ...at, row: at.row + 1 }),
  'ArrowUp': at => ({ ...at, row: at.row - 1 }),
  'PageDown': at => ({ ...at, row: at.row + PAGE_ROWS }),
  'PageUp': at => ({ ...at, row: at.row - PAGE_ROWS }),
  'Control+Home': at => ({ ...at, row: 0 }),
  'Control+End': (at, rows) => ({ ...at, row: rows - 1 }),
  // (the caret moves in the field first: the cell changes only from its edge)
  'ArrowLeft': (at, _rows, edges) => ({ ...at, col: edges.start ? at.col - 1 : at.col }),
  'ArrowRight': (at, _rows, edges) => ({ ...at, col: edges.end ? at.col + 1 : at.col }),
}

/**
 * The cell kept within the grid, or null when it is the one the key was pressed in.
 *
 * @param to where the key goes
 * @param at where it was pressed
 * @param rows how many rows the grid has
 * @returns the cell, or null
 */
function within(to: Where, at: Where, rows: number): Where | null {
  const kept = { row: Math.min(Math.max(to.row, 0), rows - 1), col: Math.min(Math.max(to.col, 0), EDIT_COLUMNS.length - 1) }

  return kept.row === at.row && kept.col === at.col ? null : kept
}

/**
 * The cell a key goes to from another, as in a spreadsheet: up and down (and Enter, down) between rows, Page Up and Page Down ten
 * rows, Control and Home or End to the first and the last row, left and right between columns where the caret of the field is
 * at its edge (else the caret moves). A key with Alt or Shift is the browser's.
 *
 * @param press the key
 * @param at the cell it is pressed in
 * @param rows how many rows the grid has
 * @param edges whether the caret is at the start and at the end of the field
 * @returns the cell, or null when the key goes nowhere (it is not one that moves, or the grid ends there)
 */
export function nextCell(press: Press, at: Where, rows: number, edges: Edges): Where | null {
  const goes = press.other ? undefined : GOES[`${press.ctrl ? 'Control+' : ''}${press.key}`]

  return goes ? within(goes(at, rows, edges), at, rows) : null
}

/** What a cell is: a number to type or one of a few choices to pick. */
export interface CellSpec {
  /** A number typed, or one of a few choices. */
  kind: 'number' | 'choice'
  /** The message that names it. */
  labelKey: string
  /** A unit shown beside it. */
  unit?: string
  /** What the item says now (a choice's value; a number, or null when none is given). */
  value: number | null
  /** The choices of a `choice` cell. */
  choices?: readonly { value: number, labelKey: string }[]
  /** The change to the item that sets the cell. */
  write(value: number | null): Partial<PlanItem>
  /** The keys of the problems that say this cell is wrong. */
  keys: readonly string[]
  /** The id of the field, when the problems name it (`params.field`). */
  fieldId?: string
}

/** The problems that are about the place, and about the altitude. */
const PLACE_KEYS = ['noPlace', 'offGlobe', 'atZero']
const ALTITUDE_KEYS = ['noAltitude', 'altHigh', 'takeoffAltitude']

/** The problems that are about a field without naming it (a jump to an item that is not there is about its target). */
const FIELD_KEYS: Record<string, readonly string[]> = { jumpTo: ['jumpTarget'] }

/** The frames an altitude may be measured from. */
const FRAMES = [
  { value: FRAME_ABOVE_HOME, labelKey: 'plan.frame.home' },
  { value: FRAME_ABSOLUTE, labelKey: 'plan.frame.sea' },
  { value: FRAME_TERRAIN, labelKey: 'plan.frame.terrain' },
] as const

/**
 * The cell of a latitude or a longitude.
 *
 * @param axis which
 * @returns what makes the cell, for an item of a command
 */
function place(axis: 'lat' | 'lon'): (item: PlanItem, def: CommandDef) => CellSpec | null {
  const cell = (item: PlanItem): CellSpec => ({
    kind: 'number',
    labelKey: `plan.table.col.${axis}`,
    value: item[axis],
    write: value => ({ [axis]: value }),
    keys: PLACE_KEYS,
  })

  return (item, def) => (def.place === 'none' ? null : cell(item))
}

/**
 * The cell of the altitude.
 *
 * @param item the item
 * @param def its command
 * @returns the cell, or null for a command with no altitude
 */
function altitude(item: PlanItem, def: CommandDef): CellSpec | null {
  return def.altitude
    ? { kind: 'number', labelKey: 'plan.table.col.alt', value: item.alt, write: value => ({ alt: value }), keys: ALTITUDE_KEYS }
    : null
}

/**
 * The cell of the frame of the altitude.
 *
 * @param item the item
 * @param def its command
 * @returns the cell, or null for a command whose frame the vehicle does not keep
 */
function frame(item: PlanItem, def: CommandDef): CellSpec | null {
  return keepsFrame(def)
    ? {
      kind: 'choice',
      labelKey: 'plan.table.col.frame',
      value: item.frame,
      choices: FRAMES,
      write: value => ({ frame: value ?? item.frame }),
      keys: [],
    }
    : null
}

/**
 * The cell of a field of the command.
 *
 * @param field the field
 * @param item the item
 * @returns the cell
 */
function settingOf(field: Field, item: PlanItem): CellSpec {
  return {
    kind: field.kind,
    labelKey: field.labelKey,
    unit: field.unit,
    value: field.read(item),
    choices: field.choices,
    write: value => field.write(item, value),
    keys: FIELD_KEYS[field.id] ?? [],
    fieldId: field.id,
  }
}

/**
 * The cell of one of the fields of the command, by its place in the command's form.
 *
 * @param index which field (from 0)
 * @returns what makes the cell
 */
function setting(index: number): (item: PlanItem, def: CommandDef) => CellSpec | null {
  return (item, def) => {
    const field = def.fields[index]

    return field ? settingOf(field, item) : null
  }
}

/** What makes the cell of each column. */
const CELLS: Record<EditColumn, (item: PlanItem, def: CommandDef) => CellSpec | null> = {
  lat: place('lat'),
  lon: place('lon'),
  alt: altitude,
  frame,
  s1: setting(0),
  s2: setting(1),
  s3: setting(2),
  s4: setting(3),
}

/**
 * The cell of an item in a column.
 *
 * @param item the item
 * @param column the column
 * @returns the cell, or null when the item's command has nothing there (or the page does not know the command)
 */
export function cellOf(item: PlanItem, column: EditColumn): CellSpec | null {
  const def = definitionOf(item.command)

  return def ? CELLS[column](item, def) : null
}

/**
 * The problems that say a cell is wrong.
 *
 * @param problems the problems of the item
 * @param cell the cell
 * @returns them
 */
export function problemsOfCell(problems: readonly Problem[], cell: CellSpec): Problem[] {
  const named = (problem: Problem): boolean => cell.fieldId !== undefined && problem.params?.field === cell.fieldId

  return problems.filter(problem => cell.keys.includes(problem.key) || named(problem))
}

/**
 * The problems of an item that no cell takes: the ones about the item as a whole (a takeoff that is not first), or about a field
 * that has no cell (the yaw).
 *
 * @param item the item
 * @param problems the problems of the item
 * @returns them
 */
export function problemsOfRow(item: PlanItem, problems: readonly Problem[]): Problem[] {
  const taken = new Set<Problem>()
  for (const column of EDIT_COLUMNS) {
    const cell = cellOf(item, column)
    if (cell) {
      problemsOfCell(problems, cell).forEach(problem => taken.add(problem))
    }
  }

  return problems.filter(problem => !taken.has(problem))
}
