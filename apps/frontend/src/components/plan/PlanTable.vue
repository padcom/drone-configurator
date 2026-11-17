<template>
  <div class="plan-table">
    <div ref="scroller" class="plan-table-scroll" @scroll="scrolled">
      <div
        ref="grid"
        class="plan-grid"
        role="grid"
        :aria-label="t('plan.table.label')"
        aria-describedby="plan-table-help"
        :aria-rowcount="items.length + 1"
        :aria-colcount="EDIT_COLUMNS.length + 2"
        @keydown="key"
        @focusin="focusedIn"
      >
        <div class="plan-grid-head" role="row" aria-rowindex="1" :style="{ height: `${HEAD_PX}px` }">
          <div v-for="(heading, at) in headings" :key="heading.id" class="plan-th" role="columnheader" :aria-colindex="at + 1">
            {{ heading.text }}
          </div>
        </div>
        <div class="plan-grid-body" role="rowgroup" :style="{ height: `${items.length * ROW_PX}px` }">
          <PlanTableRow
            v-for="row in rows"
            :key="row.item.id"
            :item="row.item"
            :index="row.index"
            :selected="row.item.id === selected"
            :problems="problemsByItem.get(row.item.id) ?? NONE"
            :stop="row.item.id === stopId ? stopColumn : null"
          />
        </div>
      </div>
    </div>
    <p id="plan-table-help" class="visually-hidden">{{ t('plan.table.help') }}</p>
  </div>
</template>

<script setup lang="ts">
// The items of the plan as a table, to edit them as in a spreadsheet: a row for an item, a cell for its place, its altitude and
// frame and the (up to four) fields of its command; the same fields as the form has, so what is typed is the same edit and goes
// into the same history, and the cell the plan says is wrong says so in words. A plan has up to a thousand items: only the rows
// in view are drawn (every row is the same height), and the grid is ONE tab stop (the cell that has the focus, else the selected
// row's first cell), with the keys of a spreadsheet (lib/plan/table.ts). The selected item is the row that has the focus, and the
// other way round: selecting an item elsewhere shows its row. Nothing here is sent to a vehicle.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlan } from '@/composables/usePlan'
import type { Problem } from '@/lib/plan/validate'
import {
  EDIT_COLUMNS, type Edges, type EditColumn, HEAD_PX, type Press, ROW_PX, type Where, nextCell, rowsInView, scrollFor,
} from '@/lib/plan/table'
import PlanTableRow from './PlanTableRow.vue'

/** The height (px) the area is taken to have when it cannot be measured (a window that does not lay out). */
const UNMEASURED_PX = 520
/** What an item without a problem has. */
const NONE: readonly Problem[] = []

const { t } = useI18n()
const state = usePlan()
const { selected } = state
const items = computed(() => state.plan.value.items)
const scroller = ref<HTMLElement | null>(null)
const grid = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const height = ref(UNMEASURED_PX)
/** The cell that had the focus last: the one Tab comes to. */
const active = ref<{ id: number, column: EditColumn } | null>(null)

const headings = computed(() => [
  { id: 'number', text: t('plan.table.col.number') },
  { id: 'command', text: t('plan.table.col.command') },
  { id: 'lat', text: t('plan.table.col.lat') },
  { id: 'lon', text: t('plan.table.col.lon') },
  { id: 'alt', text: t('plan.table.col.alt') },
  { id: 'frame', text: t('plan.table.col.frame') },
  ...[1, 2, 3, 4].map(number => ({ id: `s${number}`, text: t('plan.table.col.setting', { number }) })),
])
const visible = computed(() => rowsInView(scrollTop.value, height.value, items.value.length))
const rows = computed(() => items.value.slice(visible.value.first, visible.value.end).map((item, at) => ({
  item,
  index: visible.value.first + at,
})))
/** The problems the plan says, by the item they are about (the plan's as a whole belong to no row). */
const problemsByItem = computed(() => {
  const found = new Map<number, Problem[]>()
  for (const problem of state.problems.value) {
    if (problem.itemId !== null) {
      found.set(problem.itemId, [...(found.get(problem.itemId) ?? []), problem])
    }
  }

  return found
})
/** The row the grid stops at: the one that had the focus, else the selected one, else the first. */
const stopId = computed(() => {
  const ids = items.value.map(item => item.id)

  return [active.value?.id, selected.value].find(id => id !== undefined && id !== null && ids.includes(id)) ?? ids[0] ?? null
})
const stopColumn = computed<EditColumn>(() => active.value?.column ?? 'lat')

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
 * @param row the row (from 0)
 */
function show(row: number): void {
  const to = scrollFor(row, scrollTop.value, height.value)

  if (scroller.value && to !== scrollTop.value) {
    scroller.value.scrollTop = to
    scrollTop.value = to
  }
}

/**
 * The cell an element is in.
 *
 * @param target the element
 * @returns the cell, or null when it is not in one
 */
function cellOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('[data-col]') : null
}

/**
 * Where a cell is in the grid.
 *
 * @param cell the cell's element
 * @returns the row (from 0) and the column, or null when the item is not in the plan any more
 */
function locate(cell: HTMLElement): Where | null {
  const id = Number(cell.closest<HTMLElement>('[data-row]')?.dataset.row)
  const row = items.value.findIndex(item => item.id === id)
  const col = EDIT_COLUMNS.indexOf(cell.dataset.col as EditColumn)

  return row >= 0 && col >= 0 ? { row, col } : null
}

/**
 * Where the element that has the focus is in the grid.
 *
 * @param target the element
 * @returns the cell, or null when it is in none
 */
function whereIs(target: EventTarget | null): Where | null {
  const cell = cellOf(target)

  return cell ? locate(cell) : null
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
 * Whether the caret of a field is at the start and at the end of what is in it (a cell with no text in it is at both).
 *
 * @param target the element that has the focus
 * @returns the two
 */
function edgesOf(target: EventTarget | null): Edges {
  return target instanceof HTMLInputElement
    ? { start: caretAt(target, 0), end: caretAt(target, target.value.length) }
    : { start: true, end: true }
}

/**
 * Puts the focus in a cell: the field in it, or the cell itself when it has none.
 *
 * @param cell the cell's element
 */
function focusIn(cell: HTMLElement | null | undefined): void {
  const target = cell?.querySelector<HTMLElement>('input, select') ?? cell

  target?.focus()
}

/**
 * Goes to a cell: its row is shown (it may not be drawn yet) and the focus is put in it.
 *
 * @param to the cell
 */
async function focusCell(to: Where): Promise<void> {
  const item = items.value[to.row]
  const column = EDIT_COLUMNS[to.col]

  if (item && column) {
    show(to.row)
    await nextTick()
    focusIn(grid.value?.querySelector<HTMLElement>(`[data-row="${item.id}"] [data-col="${column}"]`))
  }
}

/**
 * The key, as the grid reads it.
 *
 * @param event the key
 * @returns the key, and whether Control or Command, and Alt or Shift, are down
 */
function pressOf(event: KeyboardEvent): Press {
  return { key: event.key, ctrl: event.ctrlKey || event.metaKey, other: event.altKey || event.shiftKey }
}

/**
 * A key in the grid: the keys of a spreadsheet move between the cells (the keys of a field that are not those stay the field's).
 *
 * @param event the key
 */
function key(event: KeyboardEvent): void {
  const at = whereIs(event.target)
  const to = at ? nextCell(pressOf(event), at, items.value.length, edgesOf(event.target)) : null

  if (to) {
    event.preventDefault()
    void focusCell(to)
  }
}

/**
 * The focus is in a cell: it is the one Tab comes back to, and the item of its row is the selected one.
 *
 * @param at the cell
 */
function remember(at: Where): void {
  const item = items.value[at.row]
  const column = EDIT_COLUMNS[at.col]

  if (item && column) {
    active.value = { id: item.id, column }
    state.select(item.id)
  }
}

/**
 * The focus came to an element of the grid.
 *
 * @param event the focus
 */
function focusedIn(event: FocusEvent): void {
  const at = whereIs(event.target)

  if (at) {
    remember(at)
  }
}

// An item selected elsewhere (the list, the map, Undo) has its row shown (the focus is not taken).
watch(selected, id => {
  const row = items.value.findIndex(item => item.id === id)

  if (row >= 0) {
    show(row)
  }
})

const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)

onMounted(() => {
  measure()
  scrolled()

  if (scroller.value) {
    observer?.observe(scroller.value)
  }
  // (the table opens at the selected item)
  const row = items.value.findIndex(item => item.id === selected.value)

  if (row >= 0) {
    show(row)
  }
})

onBeforeUnmount(() => observer?.disconnect())
</script>
