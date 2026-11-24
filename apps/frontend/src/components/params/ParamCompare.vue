<template>
  <section id="compare" class="compare" :aria-label="t('compare.region')">
    <header class="compare-head">
      <div>
        <h3>{{ heading }}</h3>
        <p v-if="side" id="compare-summary">{{ summaryOf(counts, t) }}</p>
      </div>
      <Button id="close-compare" @click="compare.close()">{{ t('compare.close') }}</Button>
    </header>
    <p v-if="compare.loading.value" class="compare-loading" role="status">{{ t('compare.loading') }}</p>
    <p v-if="compare.error.value" class="compare-error" role="alert">{{ compare.error.value }}</p>
    <template v-if="side">
      <p v-if="side.vehicleWarning" class="review-warning" role="alert">
        {{ t('import.itWas', { warning: side.vehicleWarning }) }}
      </p>
      <ul v-if="side.notes.length > 0" class="review-notes" :aria-label="t('import.notes')">
        <li v-for="note in side.notes" :key="note">{{ note }}</li>
      </ul>
      <div class="compare-filters">
        <Toggle id="compare-only-differences" v-model="onlyDifferences">{{ t('compare.onlyDifferences') }}</Toggle>
        <label class="compare-field">
          <span>{{ t('compare.group') }}</span>
          <Select id="compare-group" v-model="group" :options="groups" />
        </label>
        <label class="compare-field">
          <span>{{ t('compare.search') }}</span>
          <TextInput id="compare-search" v-model="search" mono autocomplete="off" />
        </label>
      </div>
      <div class="compare-table">
        <DataTable
          :rows="rows"
          :columns="columns"
          :row-key="rowKey"
          :filter="shows"
          :row-class="rowClass"
          :row-attrs="rowAttrs"
          :label="t('compare.table')"
          :help="t('compare.help')"
          fields
        >
          <template #cell="{ row, column, stop }">
            <span v-if="column.id === 'copy'" class="compare-td">
              <input
                type="checkbox"
                :data-copy="row.row.id"
                :tabindex="stop ? 0 : -1"
                :aria-label="t('compare.copy', { id: row.row.id })"
                :checked="compare.picked.value.includes(row.row.id)"
                :disabled="!row.copyable"
                @change="compare.toggle(row.row.id)"
              >
            </span>
            <span v-else class="compare-td" :class="column.id" :tabindex="stop ? 0 : -1">{{ column.value(row) }}</span>
          </template>
        </DataTable>
      </div>
      <div class="review-actions">
        <p class="review-status" role="status">{{ pickedText(compare.picked.value.length, t) }}</p>
        <Button id="compare-review" variant="primary" :disabled="compare.picked.value.length === 0" @click="compare.review()">
          {{ t('compare.review', { count: compare.picked.value.length }) }}
        </Button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import DataTable from '@/components/ui/DataTable.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { type CompareCells, cellsOf, pickedText, summaryOf } from '@/lib/params/compareView'
import { type CompareRow, copyable, countsOf, rowShows } from '@/lib/params/paramCompare'
import { groupOf } from '@/lib/params/paramGroups'
import { compareNames } from '@/lib/params/naturalOrder'
import { sourceWords } from '@/lib/params/snapshotImport'
import type { Column } from '@/lib/ui/dataTable'
import { useConfigurator } from '@/composables/useConfigurator'

// The vehicle's parameters next to a parameter file, a snapshot or the firmware's defaults (#40): one row a parameter, with the
// value on each side (with its name or its units from the metadata), how they compare, and a tick to copy the other value
// across. Only the differences show at first; a group and a search narrow the rows. The table is the kit's (only the rows in
// view are drawn, one tab stop, a spreadsheet's keys; Space ticks). Nothing is written from here: the rows copied across go to
// the review, ticked, and are written from there after a confirmation, read back, and never while the vehicle may be armed.

/** A row as the table has it: the comparison's row, its cells in words, and whether it can be copied. */
interface Shown extends CompareCells {
  /** The comparison's row. */
  row: CompareRow
  /** Whether it can be copied across. */
  copyable: boolean
}

const { t } = useI18n()
const { compare, fields } = useConfigurator()
const side = computed(() => compare.side.value)
const words = computed(() => (side.value ? sourceWords(side.value.source, t) : null))
const heading = computed(() => (words.value ? t('compare.heading', { source: words.value.heading }) : t('compare.title')))
const counts = computed(() => countsOf(compare.rows.value))
const rows = computed<Shown[]>(() => compare.rows.value.map(row => ({
  row,
  copyable: copyable(row),
  ...cellsOf(row, fields.metadata.value.get(row.id), t),
})))
const groups = computed(() => [
  { value: '', label: t('compare.allGroups') },
  ...[...new Set(compare.rows.value.map(row => groupOf(row.id)))].sort(compareNames).map(id => ({ value: id, label: id })),
])

/**
 * A filter's field as a model.
 *
 * @param key the field
 * @returns the model
 */
function filterModel<K extends 'onlyDifferences' | 'group' | 'search'>(key: K) {
  return computed({
    get: () => compare.filter.value[key],
    set: value => compare.setFilter({ [key]: value }),
  })
}

const onlyDifferences = filterModel('onlyDifferences')
const group = filterModel('group')
const search = filterModel('search')
const describe = (id: string) => fields.metadata.value.get(id)?.description ?? ''
const shows = computed(() => {
  const filter = compare.filter.value

  return (shown: Shown) => rowShows(shown.row, filter, describe)
})

const columns = computed<Column<Shown>[]>(() => [
  {
    id: 'copy', header: t('compare.column.copy'), width: 72, sortable: false, resizable: false,
    value: shown => Number(shown.copyable),
  },
  { id: 'name', header: t('params.column.name'), width: 220, rowHeader: true, sortable: true, value: shown => shown.row.id },
  { id: 'vehicle', header: t('import.column.vehicle'), width: 200, sortable: false, value: shown => shown.vehicle },
  { id: 'other', header: words.value?.column ?? '', width: 200, sortable: false, value: shown => shown.other },
  { id: 'status', header: t('compare.column.status'), width: 320, sortable: true, value: shown => shown.status },
])

/**
 * What names a row.
 *
 * @param shown the row
 * @returns its parameter's id
 */
const rowKey = (shown: Shown) => shown.row.id

/**
 * A row's class: a reason or a warning is marked (and said in words).
 *
 * @param shown the row
 * @returns the class
 */
const rowClass = (shown: Shown) => (shown.tone === 'warn' ? 'warn' : undefined)

/**
 * A row's attributes, for the page and its tests to find it by.
 *
 * @param shown the row
 * @returns the attributes
 */
const rowAttrs = (shown: Shown) => ({ 'data-id': shown.row.id, 'data-status': shown.row.status })
</script>
