<template>
  <div ref="scroller" class="param-scroll" @scroll.passive="onScroll">
    <!-- One tab stop for the whole list: the table takes the focus, and the selected row is the one it points to
         (aria-activedescendant), so that the rows that are not drawn need no tab stop. The keys are in onKey. -->
    <table
      v-if="visible.length > 0"
      id="param-list"
      role="grid"
      tabindex="0"
      :class="{ described: meaning }"
      :aria-label="t('params.list')"
      :aria-rowcount="visible.length + 1"
      :aria-activedescendant="activeRow"
      @mousedown="onPress"
      @focus="onFocus"
      @keydown="onKey"
    >
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
          :id="`param-row-${row.param.id}`"
          :key="row.param.id"
          :data-id="row.param.id"
          :aria-rowindex="from + i + 2"
          :aria-selected="row.param.id === fields.selected.value ? 'true' : 'false'"
          :class="{ selected: row.param.id === fields.selected.value }"
          @click="onRowClick(row.param.id)"
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
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import EmptyState from './kit/EmptyState.vue'
import { effectiveGroup, splitName } from './paramGroups'
import { listStatusText, visibleParams } from './paramList'
import { useConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'
import { type Viewport, movedRow, pageRows, scrollToRow, windowOf } from './rowWindow'

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

// The selected row, by its place in the list (-1: none, or it is filtered out), and the row the table points to for a screen
// reader (only while it is drawn: the rows far from the view are not in the page).
const selectedAt = computed(() => rows.value.findIndex(row => row.param.id === fields.selected.value))
const drawn = computed(() => selectedAt.value >= from.value && selectedAt.value < to.value)
const activeRow = computed(() => drawn.value ? `param-row-${fields.selected.value}` : undefined)

/**
 * Where a scroll box is, and how big what it holds is.
 *
 * @param box the scroll box
 * @returns the position, the height, the height of the header and of a row
 */
function viewport(box: HTMLElement): Viewport {
  const header = box.querySelector('thead')?.offsetHeight ?? 0

  return { scrolled: box.scrollTop, height: box.clientHeight, header, rowPx: ROW_PX }
}

/**
 * Scrolls the list just far enough that a row is in view, also one that is not drawn.
 *
 * @param index the place of the row in the list
 */
function reveal(index: number): void {
  const box = scroller.value
  // A box that is not laid out (hidden, with the screen that is kept alive) has no height to scroll by.
  if (box && box.clientHeight > 0) {
    box.scrollTop = scrollToRow(index, viewport(box))
    measure()
  }
}

/**
 * How many rows a page is, now.
 *
 * @returns the rows that fit in the box
 */
function pageNow(): number {
  return scroller.value ? pageRows(viewport(scroller.value)) : 1
}

/**
 * Selects the row at a place in the list, and shows it.
 *
 * @param index the place
 */
function selectAt(index: number): void {
  const row = rows.value[index]
  if (row) {
    parameters.select(row.param.id)
    reveal(index)
  }
}

// A press of the mouse on a row focuses the table, and is a choice of that row, not of the first one: only a focus that
// the keyboard (or another part of the page: Enter in the search, Escape in the groups) gives selects the first row.
let pressed = false

/** The mouse is down on the list: the focus it brings is not a keyboard's. */
function onPress(): void {
  pressed = true
  window.addEventListener('mouseup', () => {
    pressed = false
  }, { once: true })
}

/** The list takes the focus with nothing selected (or the selected one filtered out): the first row is selected. */
function onFocus(): void {
  if (!pressed && selectedAt.value < 0) {
    selectAt(0)
  }
}

/**
 * Enter in the list: the focus goes to the Value field, with its text selected. A key that is held down repeats, and the
 * repeats do nothing (the first one has moved the focus: the next would be typed into the field).
 *
 * @param event the key press
 */
function focusValue(event: KeyboardEvent): void {
  event.preventDefault()

  if (!event.repeat) {
    const field = document.getElementById('draft') as HTMLInputElement | null
    field?.focus()
    field?.select()
  }
}

/**
 * Whether a key press is the key alone (Ctrl, Alt and Meta with a key are other shortcuts).
 *
 * @param event the key press
 * @returns true for the key alone, or with Shift
 */
const isPlain = (event: KeyboardEvent): boolean => !(event.altKey || event.ctrlKey || event.metaKey)

/**
 * The keys of the list: Up and Down move the selection by a row, Page Up and Page Down by a page, Home and End to the first
 * and the last, and Enter goes to the Value field.
 *
 * @param event the key press
 */
function onKey(event: KeyboardEvent): void {
  if (!isPlain(event)) {
    return
  }
  if (event.key === 'Enter') {
    focusValue(event)

    return
  }
  const target = movedRow(event.key, selectedAt.value, rows.value.length, pageNow())
  if (target >= 0) {
    event.preventDefault()
    selectAt(target)
  }
}

// The row that a click selected: it is where the user pressed, so the list is left as it is (a row that is cut by the edge of
// the box is not nudged).
let clicked = ''

/**
 * A row is clicked: it is selected, and the list does not move.
 *
 * @param id the parameter
 */
function onRowClick(id: string): void {
  clicked = fields.selected.value === id ? '' : id
  parameters.select(id)
}

// A parameter that becomes the selected one by another way (the Related list, the changes, a group, the search) is scrolled
// into view; choosing a group selects its first parameter, with the list at the top. The focus is not moved.
watch([() => fields.selected.value, () => fields.filter.value], async () => {
  await nextTick()
  const byClick = clicked !== '' && clicked === fields.selected.value
  clicked = ''

  if (selectedAt.value >= 0 && !byClick) {
    reveal(selectedAt.value)
  }
})
watch(() => choice.chosen.value, () => selectAt(0))

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
