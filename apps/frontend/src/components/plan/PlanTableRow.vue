<template>
  <div
    class="plan-tr"
    :class="{ selected, bad: rowWords !== '' }"
    role="row"
    :aria-rowindex="index + 2"
    :aria-selected="selected"
    :data-row="item.id"
    :style="{ top: `${index * ROW_PX}px`, height: `${ROW_PX}px` }"
  >
    <div
      class="plan-td plan-td-no"
      role="rowheader"
      aria-colindex="1"
      :aria-describedby="rowWords === '' ? undefined : rowErrorId"
    >
      <span>{{ index + 1 }}</span>
      <span v-if="rowWords !== ''" class="plan-td-mark" aria-hidden="true" :title="rowWords">!</span>
      <span v-if="rowWords !== ''" :id="rowErrorId" class="visually-hidden">{{ rowWords }}</span>
    </div>
    <div class="plan-td plan-td-command" role="gridcell" aria-colindex="2">{{ commandName }}</div>
    <PlanTableCell
      v-for="column in EDIT_COLUMNS"
      :key="column"
      :item="item"
      :column="column"
      :cell="cellOf(item, column)"
      :problems="cellProblems(column)"
      :stop="stop === column"
      @write="state.update(item.id, $event)"
    />
  </div>
</template>

<script setup lang="ts">
// One row of the table: the number and the command of the item, and its cells. The row is placed by its number, since the table
// draws only the rows that are in view. A problem of the item that is no cell's (a yaw that is missing) marks the row, in words.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlan } from '@/composables/usePlan'
import { definitionOf } from '@/lib/plan/catalog'
import type { PlanItem } from '@/lib/plan/model'
import { type EditColumn, EDIT_COLUMNS, ROW_PX, cellOf, problemsOfCell, problemsOfRow } from '@/lib/plan/table'
import type { Problem } from '@/lib/plan/validate'
import PlanTableCell from './PlanTableCell.vue'
import { problemWords } from './problemWords'

const props = defineProps<{
  /** The item. */
  item: PlanItem
  /** Its place in the plan (from 0). */
  index: number
  /** Whether it is the selected one. */
  selected: boolean
  /** The problems the plan says of the item. */
  problems: readonly Problem[]
  /** The column of this row that Tab stops at, or null when it is not the row the grid stops at. */
  stop: EditColumn | null
}>()

const { t } = useI18n()
const state = usePlan()
const commandName = computed(() => {
  const def = definitionOf(props.item.command)

  return def ? t(`plan.cmd.${def.id}`) : String(props.item.command)
})
const rowErrorId = computed(() => `plan-row-error-${props.item.id}`)
const rowWords = computed(() => {
  const own = problemsOfRow(props.item, props.problems)

  return own.map(problem => problemWords(problem, props.item, t)).join(' ')
})

/**
 * The problems of the item that are about a cell.
 *
 * @param column the column
 * @returns them
 */
function cellProblems(column: EditColumn): Problem[] {
  const cell = cellOf(props.item, column)

  return cell ? problemsOfCell(props.problems, cell) : []
}
</script>
