<template>
  <div class="data-table">
    <div ref="scroller" class="data-table-scroll" @scroll="scrolled">
      <div
        class="data-table-grid"
        role="grid"
        :aria-label="label"
        :aria-describedby="`${uid}-help`"
        :aria-rowcount="shown.length + 1"
        :aria-colcount="columns.length"
        :style="{ width: `${total}px` }"
        @keydown="onKey"
        @focusin="focusedIn"
      >
        <div
          class="data-table-head"
          role="row"
          aria-rowindex="1"
          :style="{ gridTemplateColumns: template, height: `${HEAD_PX}px` }"
        >
          <div
            v-for="(column, at) in columns"
            :key="column.id"
            class="data-table-th"
            :class="{ end: column.align === 'end' }"
            role="columnheader"
            :aria-colindex="at + 1"
            :aria-sort="ariaSortOf(sort, column)"
          >
            <button v-if="column.sortable" type="button" class="data-table-sort" @click="sortBy(column)">
              <span>{{ column.header }}</span>
              <span class="data-table-arrow" aria-hidden="true">{{ arrowOf(sort, column) }}</span>
            </button>
            <span v-else class="data-table-title">{{ column.header }}</span>
            <div
              v-if="column.resizable !== false"
              class="data-table-grip"
              role="separator"
              aria-orientation="vertical"
              tabindex="0"
              :aria-label="t('table.resize', { name: column.header })"
              :aria-valuenow="widths[at]"
              :aria-valuemin="column.min ?? MIN_WIDTH"
              :aria-valuemax="MAX_WIDTH"
              @pointerdown="dragStart($event, column)"
              @keydown="nudge($event, column)"
            />
          </div>
        </div>
        <div class="data-table-body" role="rowgroup" :style="{ height: `${shown.length * rowPx}px` }">
          <!-- A row is its own component, keyed by the row: it is drawn again only when what it is given changes (its row, its
               place, the widths, the cursor or an edit in it), so a cell that is updated (its row replaced by another) draws that
               one row, and a scroll draws only the rows that come into view. The memo spares the table even the row's vnode
               when nothing it is given changed (it is kept by place: after a scroll it misses, and the keyed row is still not
               drawn). -->
          <DataTableRow
            v-for="entry in drawn"
            :key="entry.key"
            v-memo="[
              entry.row, entry.index, columns, template, fields, rowClass, rowAttrs,
              cursorColumn(entry.key), editedColumn(entry.key), editedText(entry.key), selecting && isSelected(entry.key),
              $slots.cell === undefined, $slots.editor === undefined,
            ]"
            :row="entry.row"
            :index="entry.index"
            :columns="columns"
            :template="template"
            :row-px="rowPx"
            :stop-col="cursorColumn(entry.key)"
            :edited-col="editedColumn(entry.key)"
            :edited-text="editedText(entry.key)"
            :selected="selecting ? isSelected(entry.key) : undefined"
            :fields="fields"
            :row-class="rowClass"
            :row-attrs="rowAttrs"
            :set-text="setText"
            :commit="commitEdit"
            :cancel="cancelEdit"
            :cell="$slots.cell ? renderCell : undefined"
            :editor="$slots.editor ? renderEditor : undefined"
            @cursor="cursorTo"
            @edit="editAt"
          />
        </div>
        <p v-if="shown.length === 0" class="data-table-empty">{{ t('table.empty') }}</p>
      </div>
    </div>
    <p :id="`${uid}-help`" class="visually-hidden">{{ help ?? t('table.help') }}</p>
  </div>
</template>

<script setup lang="ts" generic="Row">
// The kit's data table, for a long list of rows of the same kind: a fixed header over rows of one height, of which only
// those in view are drawn (lib/params/rowWindow.ts); a click on a header sorts by its column (ascending, descending,
// none), its edge can be dragged or moved with the arrow keys, and a `filter` function the caller gives chooses the
// rows that show. A cell shows what the column's `value` says, or what the caller's `cell` slot draws; it is edited as
// a spreadsheet's is (the `editor` slot, or a text field) and the table only tells what was typed (`edit`): the rows
// are the caller's, and it is the caller that changes one.
//
// The keys: the grid is ONE tab stop, the cell the cursor is in. The arrows, Home, End and Page Up and Down move the
// cursor; Enter, F2, or a character typed starts an edit of a cell of an editable column; Enter ends it and goes to the
// cell below, Escape drops it, Tab ends it and goes to the next cell; Tab and Shift Tab go from cell to cell when none
// is edited, and leave the table at the last and the first. The rules are plain functions (lib/ui/dataTable.ts), with
// tests.
//
// Rows are REPLACED to change them (a new object for the row that changed, as a store does), not changed in place: a
// row is drawn again only when its object, its widths or what is on it changes, so updating a cell draws one row, not
// the table.
//
// A table of FIELDS (`fields`) is a spreadsheet whose cells are the caller's own fields, always there: nothing is begun or
// ended, the focus is in a field, and the keys are those of nextFieldCell.
//
// A table can have a SELECTED row (`v-model:selected`, the row's key): it is the row the cursor is in, and the other way
// round. A row selected from outside (a map, a list) is scrolled into view and the cursor goes to it, in the column it
// was in; the focus is not taken. `rowClass` and `rowAttrs` mark a row (a problem, an id for the page).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  BIG_NUDGE_PX,
  type Cell,
  type Column,
  type Edges,
  HEAD_PX,
  type KeyAction,
  MAX_WIDTH,
  MIN_WIDTH,
  NUDGE_PX,
  type Press,
  ROW_PX,
  type Sort,
  actionFor,
  ariaSortOf,
  arrowOf,
  filterRows,
  isEditable,
  isOutside,
  nextFieldCell,
  nextSort,
  resizedWidth,
  sortRows,
  widthOf,
} from '@/lib/ui/dataTable'
import { type Viewport, pageRows, scrollToRow, windowOf } from '@/lib/params/rowWindow'
import DataTableRow, { type CellRender, type EditorRender } from './DataTableRow.vue'

/** The height (px) the table is taken to have when it cannot be measured (a window that does not lay out). */
const UNMEASURED_PX = 520

/** A place in the table by the key of its row: it stays where it is when the rows are sorted or filtered. */
interface Place {
  /** The row's key. */
  key: string | number
  /** The column. */
  col: number
}

/** A cell being edited, and the text so far. */
interface Edit extends Place {
  /** The text. */
  text: string
}

const props = defineProps<{
  /** The rows, in the order they came in. */
  rows: readonly Row[]
  /** The columns. */
  columns: readonly Column<Row>[]
  /** What names a row, the same for as long as the row is the same one (its id, its name). */
  rowKey: (row: Row) => string | number
  /** What the table is, for a screen reader (the page's words). */
  label: string
  /** Chooses the rows that show (undefined: all of them). */
  filter?: (row: Row) => boolean
  /** The height of a row (px). */
  rowPx?: number
  /** A class for a row, over the table's own (a row with a problem). */
  rowClass?: (row: Row) => string | undefined
  /** Attributes for a row (an id or a `data-` attribute the page finds it by). */
  rowAttrs?: (row: Row) => Record<string, string>
  /**
   * The cells ARE fields the caller draws (the `cell` slot: a number to type, a choice), not values to begin an edit of. The
   * focus goes into the field of a cell; the slot is told which cell is the one tab stop (`stop`) and gives its field the
   * tabindex; the arrows move between cells, left and right only from the edge of the field's text (nextFieldCell).
   */
  fields?: boolean
  /** What the keys of the table do, for a screen reader (the kit's words for a table whose cells are edited by default). */
  help?: string
}>()

const emit = defineEmits<{
  /** A cell was edited: the row, the column and the text that was typed. */
  edit: [row: Row, column: Column<Row>, text: string]
  /** The width of a column was changed (px). */
  resize: [column: Column<Row>, width: number]
}>()

/** What the rows are sorted by. */
const sort = defineModel<Sort | null>('sort', { default: null })

/** The selected row's key: null for none; undefined for a table that has no selection (`v-model:selected` is not used). */
const selected = defineModel<string | number | null | undefined>('selected', { default: undefined })
const selecting = computed(() => selected.value !== undefined)

const { t } = useI18n()
const uid = useId()
const scroller = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const height = ref(UNMEASURED_PX)
/** The widths the person gave, by column. */
const given = ref<Record<string, number>>({})
/** The cell the cursor is in. */
const cursor = ref<Place | null>(null)
/** The cell that is being edited. */
const editing = ref<Edit | null>(null)

const rowPx = computed(() => props.rowPx ?? ROW_PX)
const widths = computed(() => props.columns.map(column => widthOf(column, given.value)))
const total = computed(() => widths.value.reduce((sum, width) => sum + width, 0))
const template = computed(() => widths.value.map(width => `${width}px`).join(' '))
/** The rows that show, in order: filtered, then sorted. */
const shown = computed(() => sortRows(filterRows(props.rows, props.filter), props.columns, sort.value))
/** The place the grid stops at: the cursor, else the first cell. */
const stop = computed<Place | null>(() => {
  const [first] = shown.value

  return cursor.value ?? (first === undefined ? null : { key: props.rowKey(first), col: 0 })
})
/** The place in the table of the row the grid stops at (-1: there is none). */
const stopIndex = computed(() => (stop.value === null ? -1 : shown.value.findIndex(row => props.rowKey(row) === stop.value?.key)))
const view = computed<Viewport>(() => ({ scrolled: scrollTop.value, height: height.value, header: HEAD_PX, rowPx: rowPx.value }))

/**
 * A row with its key and its place in the table.
 *
 * @param index the place
 * @returns the entry
 */
function entryAt(index: number): { row: Row, key: string | number, index: number } {
  const row = shown.value[index] as Row

  return { row, key: props.rowKey(row), index }
}

/** The rows that are drawn: those in view, and the row the cursor is in when it is not one of them (it has the focus). */
const drawn = computed(() => {
  const { from, to } = windowOf(shown.value.length, scrollTop.value, height.value, rowPx.value)
  const entries = Array.from({ length: to - from }, (_unused, at) => entryAt(from + at))

  return isOutside(stopIndex.value, from, to) ? [...entries, entryAt(stopIndex.value)].sort((a, b) => a.index - b.index) : entries
})

/**
 * A click (or Enter) on a sortable header.
 *
 * @param column the column
 */
function sortBy(column: Column<Row>): void {
  sort.value = nextSort(sort.value, column.id)
}

/**
 * Where the tab stop is in a row, for the row to be drawn again when it moves.
 *
 * @param key the row's key
 * @returns the column, or -1 when the tab stop is not in the row
 */
function cursorColumn(key: string | number): number {
  return stop.value?.key === key ? stop.value.col : -1
}

/**
 * Which cell of a row is edited.
 *
 * @param key the row's key
 * @returns the column, or -1 when none is
 */
function editedColumn(key: string | number): number {
  return editing.value?.key === key ? editing.value.col : -1
}

/**
 * The text so far in the cell of a row that is edited.
 *
 * @param key the row's key
 * @returns the text, or null when no cell of the row is edited
 */
function editedText(key: string | number): string | null {
  return editing.value?.key === key ? editing.value.text : null
}

/**
 * Whether a row is the selected one.
 *
 * @param key the row's key
 * @returns true when it is
 */
function isSelected(key: string | number): boolean {
  return selecting.value && selected.value === key
}

/** Follows what the area scrolls. */
function scrolled(): void {
  scrollTop.value = scroller.value?.scrollTop ?? 0
}

/** Takes the height of the area. */
function measure(): void {
  height.value = scroller.value?.clientHeight || UNMEASURED_PX
}

/**
 * Scrolls so that a row is in view (it may be one that is not drawn yet).
 *
 * @param index the row (from 0)
 */
function show(index: number): void {
  const to = scrollToRow(index, view.value)

  if (scroller.value && to !== scrollTop.value) {
    scroller.value.scrollTop = to
    scrollTop.value = to
  }
}

/**
 * Whether a place in the table is a row.
 *
 * @param index the place
 * @returns true when there is a row there
 */
function isRow(index: number): boolean {
  return index >= 0 && index < shown.value.length
}

/**
 * What takes the focus in a cell: in a table of fields, the field in it (a number, a choice, or whatever the caller made
 * focusable), else the cell.
 *
 * @param cell the cell
 * @returns the element, or null when the cell is not drawn
 */
function focusTarget(cell: HTMLElement | null): HTMLElement | null {
  const field = props.fields ? cell?.querySelector<HTMLElement>('input, select, [tabindex]') : null

  return field ?? cell
}

/**
 * Puts the focus in a cell that is drawn.
 *
 * @param at the cell
 */
function focusCell(at: Cell): void {
  const cell = scroller.value?.querySelector<HTMLElement>(`[data-index="${at.row}"] [data-column="${at.col}"]`) ?? null

  focusTarget(cell)?.focus()
}

/**
 * Puts the cursor in a cell and the focus in it (its row is shown first: it may not be drawn yet). A row that is not there is no
 * place to go to.
 *
 * @param at the cell
 */
async function goTo(at: Cell): Promise<void> {
  if (isRow(at.row)) {
    cursor.value = { key: entryAt(at.row).key, col: at.col }
    show(at.row)
    await nextTick()
    focusCell(at)
  }
}

/**
 * The cursor goes where a click was.
 *
 * @param index the row
 * @param col the column
 */
function cursorTo(index: number, col: number): void {
  cursor.value = { key: entryAt(index).key, col }
}

/**
 * The text an edit starts with.
 *
 * @param first the character that was typed to start it (it replaces the text), or null
 * @param column the column
 * @param row the row
 * @returns the text
 */
function textToEdit(first: string | null, column: Column<Row>, row: Row): string {
  return first ?? String(column.value(row))
}

/**
 * Starts editing a cell, if its column can be edited.
 *
 * @param at the cell
 * @param first the character that was typed to start it (it replaces the text), or null to start with the text the cell has
 */
function beginEdit(at: Cell, first: string | null): void {
  const column = props.columns[at.col]
  const { row, key } = entryAt(at.row)

  if (column && isEditable(column, row)) {
    cursor.value = { key, col: at.col }
    editing.value = { key, col: at.col, text: textToEdit(first, column, row) }
  }
}

const slots = defineSlots<{
  /** What a cell shows (else its value as text). */
  cell?: CellRender<Row>
  /** The editor of the cell being edited (else a text field). */
  editor?: EditorRender<Row>
}>()

/**
 * The `cell` slot of the moment, as one function for every row (it stays the same, so a row is not drawn again for it).
 *
 * @param args what the slot is given
 * @returns what it draws
 */
const renderCell: CellRender<Row> = args => slots.cell?.(args)

/**
 * The `editor` slot of the moment, the same way.
 *
 * @param args what the slot is given
 * @returns what it draws
 */
const renderEditor: EditorRender<Row> = args => slots.editor?.(args)

/**
 * A double click on a cell: an edit of it begins, with the text it has.
 *
 * @param index the row
 * @param col the column
 */
function editAt(index: number, col: number): void {
  beginEdit({ row: index, col }, null)
}

/**
 * The text of the edit so far (the caller's own editor says it too).
 *
 * @param text the text
 */
function setText(text: string): void {
  if (editing.value) {
    editing.value = { ...editing.value, text }
  }
}

/**
 * The row and the column of an edit.
 *
 * @param done the edit
 * @returns the two, or null when the row is not there any more
 */
function found(done: Edit): { row: Row, column: Column<Row> } | null {
  const row = props.rows.find(candidate => props.rowKey(candidate) === done.key)
  const column = props.columns[done.col]

  return row === undefined || column === undefined ? null : { row, column }
}

/**
 * Tells an edit, when it changed the text.
 *
 * @param done the edit
 */
function tellEdit(done: Edit): void {
  const target = found(done)

  if (target !== null && done.text !== String(target.column.value(target.row))) {
    emit('edit', target.row, target.column, done.text)
  }
}

/** Ends the edit with what was typed: the table tells it, and the caller changes the row. */
function commitEdit(): void {
  const done = editing.value

  editing.value = null

  if (done !== null) {
    tellEdit(done)
  }
}

/** Ends the edit with nothing changed, and the focus goes back to the cell. */
function cancelEdit(): void {
  const done = editing.value

  editing.value = null

  if (done !== null) {
    void goTo({ row: shown.value.findIndex(row => props.rowKey(row) === done.key), col: done.col })
  }
}

/**
 * The element of the cell an element is in.
 *
 * @param target the element
 * @returns the cell's element, or null when it is in none
 */
function cellElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-column]') : null
}

/**
 * The place in the table of the row of a cell.
 *
 * @param cell the cell's element
 * @returns the row, or null when there is none
 */
function rowIndexOf(cell: HTMLElement | null): number | null {
  const index = cell?.closest<HTMLElement>('[data-index]')?.dataset.index

  return index === undefined ? null : Number(index)
}

/**
 * Where an element is in the table.
 *
 * @param target the element
 * @returns the cell, or null when it is in none
 */
function whereIs(target: EventTarget | null): Cell | null {
  const cell = cellElement(target)
  const row = rowIndexOf(cell)

  return cell === null || row === null ? null : { row, col: Number(cell.dataset.column) }
}

/**
 * The key, as the table reads it.
 *
 * @param event the key
 * @returns the key, and what is down
 */
function pressOf(event: KeyboardEvent): Press {
  return { key: event.key, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, editing: editing.value !== null }
}

/**
 * What the table does with a key in a cell.
 *
 * @param event the key
 * @param at the cell
 * @returns the action, or null when the key is not the table's
 */
function actionAt(event: KeyboardEvent, at: Cell): KeyAction | null {
  const grid = { rows: shown.value.length, cols: props.columns.length, page: pageRows(view.value) }

  return actionFor(pressOf(event), at, grid, isEditable(props.columns[at.col], shown.value[at.row]))
}

/**
 * Whether the caret of a field is in a place.
 *
 * @param field the field
 * @param at the place in its text
 * @returns true when there is no selection and the caret is there
 */
function caretAt(field: HTMLInputElement, at: number): boolean {
  return field.selectionStart === at && field.selectionEnd === at
}

/**
 * Whether the caret of the field a key was pressed in is at its start and at its end (one that is not a text field is at both).
 *
 * @param target the element the key was pressed in
 * @returns the two
 */
function edgesOf(target: EventTarget | null): Edges {
  return target instanceof HTMLInputElement
    ? { start: caretAt(target, 0), end: caretAt(target, target.value.length) }
    : { start: true, end: true }
}

/**
 * What a key does in a table of fields: it moves, or it is the field's.
 *
 * @param event the key
 * @param at the cell
 * @returns the move, or null
 */
function fieldActionAt(event: KeyboardEvent, at: Cell): KeyAction | null {
  const grid = { rows: shown.value.length, cols: props.columns.length, page: pageRows(view.value) }
  const press = { key: event.key, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey }
  const to = nextFieldCell(press, at, grid, edgesOf(event.target))

  return to === null ? null : { kind: 'move', to }
}

/**
 * Whether a key may be the table's: one an input method is composing is the method's, and one with Alt the browser's.
 *
 * @param event the key
 * @returns true when it may be
 */
function isTableKey(event: KeyboardEvent): boolean {
  return !event.isComposing && !event.altKey
}

/**
 * What the table does with a key (a key an input method is composing is the method's, and so is one with Alt).
 *
 * @param event the key
 * @returns the action, or null when the key is not the table's
 */
function actionOf(event: KeyboardEvent): KeyAction | null {
  const at = isTableKey(event) ? whereIs(event.target) : null
  const decide = props.fields ? fieldActionAt : actionAt

  return at === null ? null : decide(event, at)
}

/**
 * The cursor goes to a cell: an edit that is on ends first.
 *
 * @param to the cell
 */
function moveTo(to: Cell): void {
  commitEdit()
  void goTo(to)
}

/**
 * Does what a key says.
 *
 * @param action the action
 */
function perform(action: KeyAction): void {
  if (action.kind === 'edit') {
    beginEdit(action.at, action.first)
  }
  if (action.kind === 'cancel') {
    cancelEdit()
  }
  if (action.kind === 'move') {
    moveTo(action.to)
  }
}

/**
 * A key in the table.
 *
 * @param event the key
 */
function onKey(event: KeyboardEvent): void {
  const action = actionOf(event)

  if (action !== null) {
    event.preventDefault()
    perform(action)
  }
}

/**
 * The focus came to a cell: the cursor is there.
 *
 * @param event the focus
 */
function focusedIn(event: FocusEvent): void {
  const at = whereIs(event.target)

  if (at !== null && at.row < shown.value.length) {
    cursorTo(at.row, at.col)
  }
}

/** The edge of a column that is being dragged. */
let dragging: { column: Column<Row>, from: number, at: number } | null = null

/**
 * Changes the width of a column and tells.
 *
 * @param column the column
 * @param to the width (px)
 */
function widen(column: Column<Row>, to: number): void {
  given.value = { ...given.value, [column.id]: to }
  emit('resize', column, to)
}

/**
 * The pointer moves while an edge is dragged.
 *
 * @param event the pointer
 */
function dragMove(event: PointerEvent): void {
  if (dragging) {
    widen(dragging.column, resizedWidth(dragging.from, event.clientX - dragging.at, dragging.column.min))
  }
}

/** The pointer is up: the drag is over. */
function dragEnd(): void {
  dragging = null
  window.removeEventListener('pointermove', dragMove)
}

/**
 * The pointer is down on the edge of a column: it is dragged until the pointer is up.
 *
 * @param event the pointer
 * @param column the column
 */
function dragStart(event: PointerEvent, column: Column<Row>): void {
  event.preventDefault()
  dragging = { column, from: widthOf(column, given.value), at: event.clientX }
  window.addEventListener('pointermove', dragMove)
  window.addEventListener('pointerup', dragEnd, { once: true })
}

/**
 * A key on the edge of a column: the arrows move it (a Shift arrow moves it further).
 *
 * @param event the key
 * @param column the column
 */
function nudge(event: KeyboardEvent, column: Column<Row>): void {
  const by = event.shiftKey ? BIG_NUDGE_PX : NUDGE_PX
  const moves: Record<string, number> = { ArrowLeft: -by, ArrowRight: by }

  if (moves[event.key] !== undefined) {
    event.preventDefault()
    widen(column, resizedWidth(widthOf(column, given.value), moves[event.key] as number, column.min))
  }
}

/**
 * A place that is still in the rows that show.
 *
 * @param place the cursor or the edit
 * @param list the rows that show
 * @returns the place, or null when its row is not shown any more (it was filtered out, or removed)
 */
function kept<Found extends Place>(place: Found | null, list: readonly Row[]): Found | null {
  return place !== null && !list.some(row => props.rowKey(row) === place.key) ? null : place
}

watch(shown, list => {
  cursor.value = kept(cursor.value, list)
  editing.value = kept(editing.value, list)
})

// The cursor's row is the selected one.
watch(cursor, place => {
  if (selecting.value && place !== null && place.key !== selected.value) {
    selected.value = place.key
  }
})

/**
 * Puts the cursor in a row, in the column it was in (the first, when it was nowhere).
 *
 * @param index the row's place in the table
 */
function putCursorIn(index: number): void {
  const { key } = entryAt(index)
  const now = cursor.value

  if (now === null) {
    cursor.value = { key, col: 0 }
  } else if (now.key !== key) {
    cursor.value = { key, col: now.col }
  }
}

/**
 * A row selected from outside: the cursor goes to it (in the column it was in) and it is scrolled into view; the focus stays
 * where it is.
 *
 * @param key the row's key
 */
function followSelected(key: string | number | null | undefined): void {
  const index = shown.value.findIndex(row => props.rowKey(row) === key)

  if (index >= 0) {
    putCursorIn(index)
    show(index)
  }
}

watch(selected, followSelected)

const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)

onMounted(() => {
  measure()
  scrolled()

  if (scroller.value) {
    observer?.observe(scroller.value)
  }
  // (the table opens at the selected row)
  followSelected(selected.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  dragEnd()
})
</script>
