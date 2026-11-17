<template>
  <div
    class="plan-td"
    :class="{ none: !cell, wrong }"
    role="gridcell"
    :data-col="column"
    :aria-colindex="index + 3"
    :tabindex="cell ? undefined : stop ? 0 : -1"
    :aria-label="cell ? undefined : t('plan.table.unused')"
  >
    <template v-if="cell">
      <span v-if="named" class="plan-cell-name" aria-hidden="true" :title="name">{{ t(cell.labelKey) }}</span>
      <PlanNumber
        v-if="cell.kind === 'number'"
        class="plan-cell-input"
        :model-value="cell.value"
        :invalid="wrong"
        :aria-label="name"
        :aria-describedby="wrong ? errorId : undefined"
        :title="wrong ? words : undefined"
        :tabindex="stop ? 0 : -1"
        @update:model-value="emit('write', cell.write($event))"
      />
      <Select
        v-else
        class="plan-cell-input"
        :model-value="String(cell.value)"
        :options="options"
        :aria-label="name"
        :aria-describedby="wrong ? errorId : undefined"
        :tabindex="stop ? 0 : -1"
        @update:model-value="emit('write', cell.write(Number($event)))"
      />
      <span v-if="wrong" :id="errorId" class="visually-hidden">{{ words }}</span>
    </template>
    <span v-else aria-hidden="true">–</span>
  </div>
</template>

<script setup lang="ts">
// One cell of the table: a field for a number, or a choice, the same as the form has (it writes what the form writes), with the
// name of what it is for a screen reader, and, when the plan says it is wrong, the words of why (a visually hidden line the field
// points at, and the field's tooltip) as well as the error colour. A cell the item's command has nothing in is a dash, and is
// the grid's stop on its own when the focus comes to it. Only the cell that is the grid's stop can be tabbed to.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/ui/Select.vue'
import { type CellSpec, type EditColumn, EDIT_COLUMNS } from '@/lib/plan/table'
import type { PlanItem } from '@/lib/plan/model'
import type { Problem } from '@/lib/plan/validate'
import PlanNumber from './PlanNumber.vue'
import { problemWords } from './problemWords'

const props = defineProps<{
  /** The item. */
  item: PlanItem
  /** The column. */
  column: EditColumn
  /** What the cell is, or null when the item's command has nothing in this column. */
  cell: CellSpec | null
  /** The problems the plan says of this cell. */
  problems: readonly Problem[]
  /** Whether it is the one cell of the grid that Tab stops at. */
  stop: boolean
}>()
const emit = defineEmits<{ write: [patch: Partial<PlanItem>] }>()

const { t } = useI18n()
const index = computed(() => EDIT_COLUMNS.indexOf(props.column))
const wrong = computed(() => props.problems.length > 0)
const errorId = computed(() => `plan-cell-error-${props.item.id}-${props.column}`)
/** The fields of the command have their names beside them, as the place and the altitude have theirs in the header. */
const named = computed(() => props.column.startsWith('s'))
const name = computed(() => (props.cell ? `${t(props.cell.labelKey)}${props.cell.unit ? ` (${props.cell.unit})` : ''}` : ''))
const words = computed(() => props.problems.map(problem => problemWords(problem, props.item, t)).join(' '))
const options = computed(() => {
  const choices = props.cell?.choices ?? []

  return choices.map(({ value, labelKey }) => ({ value: String(value), label: t(labelKey) }))
})
</script>
