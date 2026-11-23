<template>
  <div class="plan-table">
    <DataTable
      v-model:selected="selectedId"
      :rows="rows"
      :columns="columns"
      :row-key="rowKey"
      :row-px="ROW_PX"
      :row-class="rowClass"
      :row-attrs="rowAttrs"
      :label="t('plan.table.label')"
      :help="t('plan.table.help')"
      fields
    >
      <template #cell="{ row, column, stop }">
        <!-- The number and the command are text, not fields: the cell itself takes the focus when it is the one tab stop. -->
        <span v-if="column.id === 'number'" class="plan-td plan-td-no" :tabindex="stop ? 0 : -1">
          <span>{{ row.index + 1 }}</span>
          <template v-if="row.words !== ''">
            <span class="plan-td-mark" aria-hidden="true" :title="row.words">!</span>
            <span class="visually-hidden">{{ row.words }}</span>
          </template>
        </span>
        <span v-else-if="column.id === 'command'" class="plan-td plan-td-command" :tabindex="stop ? 0 : -1">
          {{ commandOf(row.item) }}
        </span>
        <PlanTableCell
          v-else
          :item="row.item"
          :column="column.id as EditColumn"
          :cell="cellOf(row.item, column.id as EditColumn)"
          :problems="cellProblems(row, column.id as EditColumn)"
          :stop="stop"
          @write="state.update(row.item.id, $event)"
        />
      </template>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
// The items of the plan as a table, to edit them as in a spreadsheet: a row for an item, a cell for its place, its altitude
// and frame and the (up to four) fields of its command; the same fields as the form has, so what is typed is the same edit and
// goes into the same history, and the cell the plan says is wrong says so in words. It is the kit's table
// (components/ui/DataTable.vue) as a table of FIELDS: the cells are the form's fields, always there; only the rows in view are
// drawn, the grid is ONE tab stop, and the keys are a spreadsheet's (up and down, Enter, a page, left and right from the edge of
// a field's text). The selected item is the row the cursor is in, and the other way round: selecting an item elsewhere shows
// its row. Nothing here is sent to a vehicle.
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DataTable from '@/components/ui/DataTable.vue'
import { usePlan } from '@/composables/usePlan'
import { definitionOf } from '@/lib/plan/catalog'
import type { PlanItem } from '@/lib/plan/model'
import { EDIT_COLUMNS, type EditColumn, ROW_PX, cellOf, problemsOfCell, problemsOfRow } from '@/lib/plan/table'
import type { Problem } from '@/lib/plan/validate'
import type { Column } from '@/lib/ui/dataTable'
import PlanTableCell from './PlanTableCell.vue'
import { problemWords } from './problemWords'

/** A row of the table: the item, its place in the plan, its problems, and the words of those that are no cell's. */
interface PlanRow {
  /** The item. */
  item: PlanItem
  /** Its place in the plan (from 0). */
  index: number
  /** The problems the plan says of it. */
  problems: readonly Problem[]
  /** The words of its problems that are about no cell (a yaw that is missing), or '' for none. */
  words: string
}

/** The widths of the columns (px): the number, the command, then the editable ones. */
const WIDTHS: Record<string, number> = {
  number: 56, command: 176, lat: 136, lon: 136, alt: 104, frame: 160, s1: 224, s2: 224, s3: 224, s4: 224,
}
/** What an item without a problem has. */
const NONE: readonly Problem[] = []

const { t, locale } = useI18n()
const state = usePlan()
const items = computed(() => state.plan.value.items)

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

/** The rows made last, by their items: a row whose item, place and problems are the same is the same object. */
let made = new WeakMap<PlanItem, PlanRow>()

/**
 * Whether two lists of problems say the same (validation makes new ones each time).
 *
 * @param a one
 * @param b the other
 * @returns true when they do
 */
function sameProblems(a: readonly Problem[], b: readonly Problem[]): boolean {
  return a === b || (a.length === b.length && JSON.stringify(a) === JSON.stringify(b))
}

/**
 * Whether a row made before shows what a new one would: the same place and the same problems (its item is the same object).
 *
 * @param before the row made before
 * @param index the item's place now
 * @param problems its problems now
 * @returns true when it does
 */
function stillShows(before: PlanRow, index: number, problems: readonly Problem[]): boolean {
  return before.index === index && sameProblems(before.problems, problems)
}

/**
 * A row of the table: the one made before when nothing it shows changed, so that the table draws again only the rows that did
 * (an edit of one cell replaces that item, and the plan's other items stay the same objects).
 *
 * @param item the item
 * @param index its place
 * @returns the row
 */
function rowOf(item: PlanItem, index: number): PlanRow {
  const problems = problemsByItem.value.get(item.id) ?? NONE
  const before = made.get(item)

  if (before && stillShows(before, index, problems)) {
    return before
  }
  const words = problemsOfRow(item, problems).map(problem => problemWords(problem, item, t)).join(' ')
  const row = { item, index, problems, words }
  made.set(item, row)

  return row
}

const rows = computed(() => items.value.map(rowOf))
// (the words are the page's language: in another, every row is made again)
watch(locale, () => {
  made = new WeakMap()
})

/**
 * A column of the table.
 *
 * @param id its id
 * @param more what else it is
 * @returns the column
 */
function column(id: string, more: Partial<Column<PlanRow>> = {}): Column<PlanRow> {
  return {
    id, header: '', width: WIDTHS[id], sortable: false, resizable: false, value: row => row.index, ...more,
  }
}

const columns = computed<Column<PlanRow>[]>(() => [
  column('number', { header: t('plan.table.col.number'), rowHeader: true }),
  column('command', { header: t('plan.table.col.command') }),
  ...EDIT_COLUMNS.map(id => column(id, {
    header: id.startsWith('s') ? t('plan.table.col.setting', { number: Number(id.slice(1)) }) : t(`plan.table.col.${id}`),
  })),
])

/** The selected item, as the table's selected row (the table's cursor is in it, and the other way round). */
const selectedId = computed<number | null>({
  get: () => state.selected.value ?? null,
  set: id => {
    if (id !== null && id !== state.selected.value) {
      state.select(id)
    }
  },
})

/**
 * What names a row: its item's id.
 *
 * @param row the row
 * @returns the id
 */
const rowKey = (row: PlanRow): number => row.item.id

/**
 * A row that has a problem no cell has is marked.
 *
 * @param row the row
 * @returns the class, or undefined
 */
const rowClass = (row: PlanRow): string | undefined => (row.words === '' ? undefined : 'bad')

/**
 * What the page finds a row by: its item's id.
 *
 * @param row the row
 * @returns the attributes
 */
const rowAttrs = (row: PlanRow): Record<string, string> => ({ 'data-row': String(row.item.id) })

/**
 * The name of an item's command.
 *
 * @param item the item
 * @returns the name, or the number of a command the catalog does not have
 */
function commandOf(item: PlanItem): string {
  const def = definitionOf(item.command)

  return def ? t(`plan.cmd.${def.id}`) : String(item.command)
}

/**
 * The problems of a row that are about a cell.
 *
 * @param row the row
 * @param id the column
 * @returns them
 */
function cellProblems(row: PlanRow, id: EditColumn): Problem[] {
  const cell = cellOf(row.item, id)

  return cell ? problemsOfCell(row.problems, cell) : []
}
</script>
