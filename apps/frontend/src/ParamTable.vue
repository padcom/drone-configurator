<template>
  <div ref="scroller" class="param-scroll" @scroll.passive="onScroll">
    <table v-if="visible.length > 0" :class="{ described: meaning }" :aria-rowcount="visible.length + 1">
      <!-- The layout is fixed, from the widths of the widest name (and, with metadata, the widest value), in the mono face so
           that a character is a `ch`: the browser does not measure the text of the rows to lay the table out. The last column
           is what is left (the value without metadata, the description with it). -->
      <colgroup>
        <col class="col-name" :style="{ width: `calc(${widths.name}ch + var(--cell-padding))` }">
        <col v-if="meaning" class="col-value" :style="{ width: `calc(${widths.value}ch + var(--cell-padding))` }">
        <col>
      </colgroup>
      <thead>
        <tr aria-rowindex="1">
          <th scope="col">{{ t('params.column.name') }}</th>
          <th scope="col" class="num">{{ t('params.column.value') }}</th>
          <th v-if="meaning" scope="col">{{ t('params.column.meaning') }}</th>
        </tr>
      </thead>
      <!-- Only the rows in view (and a few more each side) are in the page: a list of a vehicle's 1400 parameters, with a
           description each, is some 4000 cells, and laying them out again each time the screen is brought back took 120 ms on
           x64 and 250 ms on arm64. A spacer row of the height of the rows that are not drawn keeps the scroll bar true. -->
      <tbody id="rows">
        <tr v-if="from > 0" class="spacer" aria-hidden="true">
          <td :colspan="columns" :style="{ height: `${from * ROW_PX}px` }" />
        </tr>
        <tr
          v-for="(row, i) in shown"
          :key="row.param.id"
          :data-id="row.param.id"
          :aria-rowindex="from + i + 2"
          :class="{ selected: row.param.id === fields.selected.value }"
          @click="parameters.select(row.param.id)"
        >
          <th scope="row" class="name"><span class="prefix">{{ row.name.prefix }}</span>{{ row.name.rest }}</th>
          <td class="num">{{ row.param.value }}</td>
          <td v-if="meaning" class="meaning" :title="row.meaning || undefined">{{ row.meaning }}</td>
        </tr>
        <tr v-if="to < rows.length" class="spacer" aria-hidden="true">
          <td :colspan="columns" :style="{ height: `${(rows.length - to) * ROW_PX}px` }" />
        </tr>
      </tbody>
    </table>
    <EmptyState v-else-if="params.length === 0" :title="t('params.empty.title')" :help="t(emptyHelp)" />
    <EmptyState v-else :title="t('params.noMatch.title')" :help="t('params.noMatch.help')">
      <Button id="clear-search" @click="clear">{{ t('params.noMatch.clear') }}</Button>
    </EmptyState>
  </div>
  <p id="list-status" class="list-status muted">{{ status }}</p>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import EmptyState from './kit/EmptyState.vue'
import { effectiveGroup, splitName } from './paramGroups'
import { listStatusText, visibleParams } from './paramList'
import { useConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'
import { windowOf } from './rowWindow'

// The parameters, one row each: the name (its group part dimmed), the value, and, when metadata is loaded, what it means.
// The header stays while the rows scroll, and only the rows in view are drawn (rowWindow.ts). The line below the table says
// how many there are and how many are shown. A list with nothing to show says why (no parameters yet, or none that match)
// and, for the second, offers the way out.
const { t } = useI18n()
const { parameters, fields } = useConfigurator()
const choice = useParamGroup()
/** The height of a row, in px (the rows are all the same: the stylesheet gives them 44). */
const ROW_PX = 44
const params = computed(() => fields.params.value)
const group = computed(() => effectiveGroup(params.value, choice.chosen.value))
const visible = computed(() => visibleParams(params.value, fields.filter.value, group.value))
const meaning = computed(() => fields.metadata.value.size > 0)
const columns = computed(() => meaning.value ? 3 : 2)
// The widest name and the widest value of the whole list (not only of what is shown, so that the columns do not move with the
// search or the scroll), in characters; the header's own words are the least a column has.
const widths = computed(() => ({
  name: params.value.reduce((widest, param) => Math.max(widest, param.id.length), 'NAME'.length),
  value: params.value.reduce((widest, param) => Math.max(widest, String(param.value).length), 'VALUE'.length + 1),
}))
// What an empty list says to do, by how the download stands: nothing yet (connect), on its way, or failed (press Download).
const EMPTY_HELP: Record<string, string> = { loading: 'params.empty.loading', failed: 'params.empty.failed' }
const emptyHelp = computed(() => EMPTY_HELP[fields.list.value] ?? 'params.empty.none')
const rows = computed(() => visible.value.map(param => ({
  param,
  name: splitName(param.id),
  meaning: fields.metadata.value.get(param.id)?.description ?? '',
})))

// Which rows are drawn: from where the scroll box is scrolled to and how tall it is.
const scroller = ref<HTMLElement | null>(null)
const scrolled = ref(0)
const height = ref(0)
const from = computed(() => windowOf(rows.value.length, scrolled.value, height.value, ROW_PX).from)
const to = computed(() => windowOf(rows.value.length, scrolled.value, height.value, ROW_PX).to)
const shown = computed(() => rows.value.slice(from.value, to.value))

/** Reads where the scroll box is scrolled to, and how tall it is. */
function measure(): void {
  const box = scroller.value
  if (box) {
    scrolled.value = box.scrollTop
    height.value = box.clientHeight
  }
}

let frame = 0
/** Follows the scroll, once a frame at most (the scroll event comes more often than that). */
function onScroll(): void {
  if (frame === 0) {
    frame = requestAnimationFrame(() => {
      frame = 0
      measure()
    })
  }
}

let observer: ResizeObserver | undefined
onMounted(() => {
  measure()

  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(scroller.value)
  }
})
// A screen that was kept alive comes back with its scroll box scrolled to wherever the browser put it.
onActivated(measure)
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})

const status = computed(() => {
  const { list, missing } = fields
  const counts = { list: list.value, total: params.value.length, missing: missing.value, shown: visible.value.length }

  return listStatusText(counts, t)
})

/** Takes the search and the group away, so that every parameter is shown again. */
function clear(): void {
  parameters.setFilter('')
  choice.choose('')
}
</script>
