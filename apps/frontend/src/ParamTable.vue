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
        <col v-if="stars" class="col-star">
        <col class="col-name" :style="{ width: `calc(${widths.name}ch + var(--cell-padding))` }">
        <col v-if="meaning" class="col-value" :style="{ width: `calc(${widths.value}ch + var(--cell-padding))` }">
        <col>
      </colgroup>
      <thead>
        <tr aria-rowindex="1">
          <th v-if="stars" scope="col" class="star"><span class="visually-hidden">{{ t('params.favourites.column') }}</span></th>
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
          <!-- The star: not a stop of the Tab key (the list is one), and it does not select the row. The key `*` does the same
               for the selected row. -->
          <td v-if="stars" class="star">
            <button
              type="button"
              tabindex="-1"
              :aria-pressed="favourites.set.value.has(row.param.id) ? 'true' : 'false'"
              :aria-label="t('params.favourites.star', { id: row.param.id })"
              @click.stop="star(row.param.id)"
            >
              <Icon name="star" />
            </button>
          </td>
          <th scope="row" class="name">
            <span class="prefix"><Marked :text="row.name.prefix" :tokens="tokens" /></span>
            <Marked :text="row.name.rest" :tokens="tokens" />
          </th>
          <!-- A value that is not the initial one has a mark that is not only a colour: heavier, and words (a tooltip, and a
               description for a screen reader: the text of the cell stays the number). -->
          <td
            class="num"
            :class="{ changed: row.initial !== undefined }"
            :title="row.changedText"
            :aria-description="row.changedText"
          >{{ showNumber(row.param.value) }}</td>
          <td v-if="meaning" class="meaning" :title="row.title || undefined">
            <span v-if="row.hit?.reason === 'close'" class="why">{{ t('params.closeMatch') }}</span>
            <Marked :text="row.shownMeaning" :tokens="tokens" />
          </td>
        </tr>
        <tr v-if="to < rows.length" class="spacer" aria-hidden="true">
          <td :colspan="columns" :style="{ height: `${(rows.length - to) * ROW_PX}px` }" />
        </tr>
      </tbody>
    </table>
    <EmptyState v-else-if="params.length === 0" :title="t('params.empty.title')" :help="t(emptyHelp)" />
    <!-- A group whose parameters are all advanced, in Standard: said, with the way to see them. -->
    <EmptyState
      v-else-if="hiddenByView"
      :title="t('params.view.hiddenTitle')"
      :help="t('params.view.hiddenHelp')"
    >
      <Button id="show-full" @click="chooseView('full')">{{ t('params.view.showFull') }}</Button>
    </EmptyState>
    <EmptyState
      v-else
      :title="t(onlyFavourites ? 'params.favourites.emptyTitle' : 'params.noMatch.title')"
      :help="t(onlyFavourites ? 'params.favourites.emptyHelp' : 'params.noMatch.help')"
    >
      <Button id="clear-search" @click="clear">{{ t('params.noMatch.clear') }}</Button>
    </EmptyState>
  </div>
  <div class="list-footer">
    <p id="list-status" class="list-status muted">{{ status }}</p>
    <!-- The Favourites group: the names of other vehicles' parameters can be taken out here (they are never in the list). -->
    <Button
      v-if="canClearMissing"
      id="clear-missing-favourites"
      :title="t('params.favourites.clearMissingHelp', { count: missingFavourites })"
      @click="pressClearMissing"
    >
      {{ t(armed ? 'params.favourites.clearAsk' : 'params.favourites.clearMissing', { count: missingFavourites }) }}
    </Button>
    <!-- When the initial values were taken, so that "changed" always says what it is changed from. -->
    <p v-if="fields.initial.value" id="initial-status" class="list-status muted">
      {{ t('params.initial.footer', { time: clockText(fields.initial.value.at) }) }}
    </p>
    <!-- Queues the initial value of every parameter that has changed since: the question is asked when they are written. -->
    <Button
      v-if="fields.initial.value"
      id="reset-all"
      :disabled="!canReset"
      :title="resetAllHelp"
      @click="resetAll"
    >
      {{ t('params.initial.resetAll', { count: targets.length }) }}
    </Button>
  </div>
  <!-- Said politely when the selection moves (Up and Down in the search move it with the focus staying there, so nothing else
       says which parameter it is now on). Always in the page, so that what is put in it is read out. -->
  <p id="selection-status" class="visually-hidden" role="status">{{ selectionText }}</p>
  <!-- What was done to the favourites, said politely: the star key leaves the focus on the table. Always in the page. -->
  <p id="favourite-status" class="visually-hidden" role="status">{{ favouriteSaid }}</p>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import EmptyState from './kit/EmptyState.vue'
import { FAVOURITES_GROUP, effectiveGroup, splitName } from './paramGroups'
import { listStatusText, visibleParams } from './paramList'
import { isBookkeeping } from './calibrationParams'
import { clockText, initialIfChanged, resetTargets } from './initialValues'
import Icon from './kit/Icon.vue'
import { useFavourites } from './favourites'
import { useToasts } from './toasts'
import { registerListNav } from './paramListNav'
import { type SearchHit, type SearchIndex, indexFor, search, tokensOf } from './paramSearch'
import type { Param } from './generated/app'
import Marked from './Marked.vue'
import { useConfigurator } from './useConfigurator'
import { showNumber } from './paramValue'
import { useGroupsSetting } from './useGroupsSetting'
import { useParamGroup } from './useParamGroup'
import { useParamView } from './useParamView'
import { type Viewport, movedRow, pageRows, scrollToRow, windowOf } from './rowWindow'

// The parameters, one row each: the name (its group part dimmed), the value, and, when metadata is loaded, what it means.
// The header stays while the rows scroll, and only the rows in view are drawn (rowWindow.ts). The line below the table says
// how many there are and how many are shown. A list with nothing to show says why (no parameters yet, or none that match)
// and, for the second, offers the way out.
const { t } = useI18n()
const { parameters, fields, staged } = useConfigurator()
const choice = useParamGroup()
/** The height of a row, in px (the rows are all the same: the stylesheet gives them 44). */
const ROW_PX = 44
const params = computed(() => fields.params.value)
// Without the groups (the setting "Show parameter groups" is off) there is no group to be in, and no star: the scope is All.
const { shown: stars } = useGroupsSetting()
const group = computed(() => stars.value ? effectiveGroup(params.value, choice.chosen.value) : '')
// The starred parameters: kept in the settings, and listed by the Favourites group (the ones the vehicle has).
const favourites = useFavourites()
const onlyFavourites = computed(() => group.value === FAVOURITES_GROUP)
// What the polite status says of the last star.
const favouriteSaid = ref('')

/**
 * Stars a parameter, or takes its star away; says so when the list would not fit in the settings.
 *
 * @param id the parameter
 */
async function star(id: string): Promise<void> {
  const adding = !favourites.set.value.has(id)
  const kept = await favourites.toggle(id)
  if (kept === 'kept') {
    // Said politely, for the key and the click alike (the focus stays where it is, and nothing else tells what happened). Only
    // when the settings have it: when they could not keep it, the star goes back and their own notice speaks.
    favouriteSaid.value = t(adding ? 'params.favourites.added' : 'params.favourites.removed', { id })
  } else if (kept === 'full') {
    useToasts().push({ severity: 'error', text: t('params.favourites.full'), long: true })
  }
}

// The favourites that this vehicle does not have: they are never in the list, so the Favourites group offers to remove them.
const onVehicle = computed(() => new Set(params.value.map(param => param.id)))
const missingFavourites = computed(() => favourites.names.value.filter(name => !onVehicle.value.has(name)).length)
// Only with this vehicle's whole list in hand: without a download (not connected, failed, incomplete) every favourite would count
// as missing, and the list is global (it is the favourites of every vehicle).
const canClearMissing = computed(() => [
  onlyFavourites.value,
  fields.connection.value.state === 'connected',
  fields.list.value === 'complete',
  params.value.length > 0,
  missingFavourites.value > 0,
].every(Boolean))
/** How long the question of the button stays (ms). */
const ARM_MS = 6000
/** How long after the question a press is ignored (ms): the time to read it. */
const SETTLE_MS = 600
let armedAt = 0

/** Takes the favourites out that are not on this vehicle. */
async function clearMissingFavourites(): Promise<void> {
  const count = missingFavourites.value
  if (await favourites.keepOnly(onVehicle.value) === 'kept') {
    favouriteSaid.value = t('params.favourites.cleared', { count })
  }
}

// A second press is needed: the first one says what is about to be lost, and the button goes back by itself.
const armed = ref(false)
let disarm: ReturnType<typeof setTimeout> | undefined
watch(canClearMissing, can => {
  armed.value = armed.value && can
})

/** The button that takes the favourites out that are not on this vehicle: the first press asks, the second does it. */
function pressClearMissing(): void {
  // A double click or a held Enter presses again within moments: that press is not an answer, the question is not read yet.
  if (armed.value && Date.now() - armedAt < SETTLE_MS) {
    return
  }
  clearTimeout(disarm)

  if (armed.value) {
    armed.value = false
    void clearMissingFavourites()

    return
  }
  armed.value = true
  armedAt = Date.now()
  favouriteSaid.value = t('params.favourites.clearAsk', { count: missingFavourites.value })
  disarm = setTimeout(() => {
    armed.value = false
    // Emptied, so that the question, said again when it is asked again, is a change a screen reader speaks.
    favouriteSaid.value = ''
  }, ARM_MS)
}
// What is searched is made once for the names and the metadata (not for each key typed, and not for a value that changes), and
// a search spans every parameter whatever the group (choosing a group clears the search, and one typed after is across all).
let searchIndex: SearchIndex | null = null
// What the chosen group lists: its parameters that the view lists (Standard leaves out the advanced ones), or the starred ones
// that the vehicle has (a star is a choice of the user's: the view does not hide it). A search is over all, whatever the view.
const { listed, view, choose: chooseView } = useParamView()
const inGroup = computed(() => onlyFavourites.value
  ? params.value.filter(param => favourites.set.value.has(param.id))
  : visibleParams(listed.value, '', group.value))
const tokens = computed(() => tokensOf(fields.filter.value))
const hits = computed(() => {
  if (tokens.value.length === 0) {
    return null
  }
  searchIndex = indexFor(searchIndex, params.value.map(param => param.id), fields.metadata.value)

  return search(searchIndex, fields.filter.value)
})
const visible = computed(() => {
  const found = hits.value
  const byId = found && new Map(params.value.map(param => [param.id, param]))

  return found && byId
    ? found.map(hit => byId.get(hit.id)).filter(param => param !== undefined)
    : inGroup.value
})
// Nothing to list in the chosen group, and Standard is why (the group has parameters, all of them advanced; no search is typed).
const hiddenByView = computed(() => [
  view.value === 'standard',
  !onlyFavourites.value,
  fields.filter.value.trim() === '',
  visibleParams(params.value, '', group.value).length > 0,
].every(Boolean))
const meaning = computed(() => fields.metadata.value.size > 0)
const columns = computed(() => (meaning.value ? 3 : 2) + (stars.value ? 1 : 0))
// The widest name and the widest value of the whole list (not only of what is shown, so that the columns do not move with the
// search or the scroll), in characters; the header's own words are the least a column has.
const widths = computed(() => ({
  name: params.value.reduce((widest, param) => Math.max(widest, param.id.length), 'NAME'.length),
  value: params.value.reduce((widest, param) => Math.max(widest, showNumber(param.value).length), 'VALUE'.length + 1),
}))
// What an empty list says to do, by how the download stands: nothing yet (connect), on its way, or failed (press Download).
const EMPTY_HELP: Record<string, string> = { loading: 'params.empty.loading', failed: 'params.empty.failed' }
const emptyHelp = computed(() => EMPTY_HELP[fields.list.value] ?? 'params.empty.none')
/**
 * What a row shows. A result that is there by its description shows the piece of it that has the words (the hit has one only
 * then), not the start of it.
 *
 * The tooltip of the description is the whole description (the long one, for a row that shows a piece of it).
 *
 * @param param the parameter
 * @param texts what the metadata says it is: in a few words, and in full
 * @param texts.description in a few words
 * @param texts.full in full
 * @param hit why it is a result of the search, if it is one
 * @returns the row
 */
function rowOf(param: Param, texts: { description: string, full: string }, hit: SearchHit | undefined) {
  const piece = hit?.snippet
  const [shownMeaning, title] = piece ? [piece, texts.full] : [texts.description, texts.description]

  return { param, name: splitName(param.id), shownMeaning, title, hit }
}

/**
 * The initial value of a parameter that is not at it, for the mark of a changed row.
 *
 * @param id the parameter
 * @returns its initial value, or undefined when it has not changed (or has none)
 */
function initialValueOf(id: string): number | undefined {
  return initialIfChanged(id, parameters.changed.value, fields.initial.value)
}

/**
 * The words for a value that is not its initial one (its tooltip, and what a screen reader is told).
 *
 * @param initial the initial value, when the parameter is not at it
 * @returns the words, or undefined for a parameter that is at its initial value
 */
function changedText(initial: number | undefined): string | undefined {
  return initial === undefined ? undefined : t('params.initial.changedFrom', { initial: showNumber(initial) })
}

const rows = computed(() => {
  const why = new Map((hits.value ?? []).map(hit => [hit.id, hit]))

  return visible.value.map(param => {
    const { description = '', longDescription = description } = fields.metadata.value.get(param.id) ?? {}

    const initial = initialValueOf(param.id)

    const row = rowOf(param, { description, full: longDescription }, why.get(param.id))

    return { ...row, initial, changedText: changedText(initial) }
  })
})

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
// What the polite status says: which parameter the selection is on, and where. It is made when the selected parameter changes
// and not when the list does (the total changes with every key typed in the search, and the region would speak while the user
// types).
const selectionText = ref('')

/**
 * An initial value as text.
 *
 * @param initial the value, if the parameter has changed from one
 * @returns the text, or an empty string for none
 */
const initialText = (initial: number | undefined): string => initial === undefined ? '' : showNumber(initial)

/**
 * What the status says of the selected parameter: its name and place, and the value it changed from when it is not at its
 * initial one (arrowing through the rows does not read the tooltip of the cell).
 *
 * @returns the words, or an empty string when nothing is selected in this list
 */
function selectionOf(): string {
  const id = fields.selected.value
  const initial = initialValueOf(id ?? '')
  const key = initial === undefined ? 'params.selection' : 'params.selectionChanged'
  const said = { id, position: selectedAt.value + 1, total: rows.value.length, initial: initialText(initial) }

  return selectedAt.value < 0 ? '' : t(key, said)
}

// The row that a new list selected by itself (a search typed, a group, a view): the status does not speak it, because the user
// did not move to it (and would hear it at every key typed in the search). It speaks when the user moves the selection.
let selectedByList = ''
watch(() => fields.selected.value, () => {
  if (fields.selected.value !== selectedByList) {
    selectionText.value = selectionOf()
  }
}, { immediate: true })
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
    const top = scrollToRow(index, viewport(box))
    // Not set when it is where it is (a scroll that does not move is no work, and a second reveal of the same row is free).
    if (box.scrollTop !== top) {
      box.scrollTop = top
    }
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
 * Moves the selection for a key (the search box asks for this too, with the focus staying in it): a row, a page, or an end.
 *
 * @param key the key
 * @returns true if the selection moved, false for a key that moves nothing or a list with no rows
 */
function moveSelection(key: string): boolean {
  const target = movedRow(key, selectedAt.value, rows.value.length, pageNow())
  selectAt(target)

  return target >= 0
}

/**
 * Whether a key press is the key alone (Ctrl, Alt and Meta with a key are other shortcuts).
 *
 * @param event the key press
 * @returns true for the key alone, or with Shift
 */
const isPlain = (event: KeyboardEvent): boolean => !(event.altKey || event.ctrlKey || event.metaKey)

/**
 * Whether a key was pressed on a star (a button that was clicked has the focus): Enter on it is the button's own, which toggles
 * the star, and not the list's, which goes to the Value field.
 *
 * @param event the key press
 * @returns true if the key came from a star
 */
const onStar = (event: KeyboardEvent): boolean => (event.target as Element).closest('td.star') !== null

/**
 * `*` stars (or unstars) the selected row.
 *
 * @param event the key press
 * @returns true if the key was `*` and a row is selected
 */
function starKey(event: KeyboardEvent): boolean {
  const selected = fields.selected.value
  const starring = stars.value && event.key === '*' && selected !== null
  if (starring) {
    event.preventDefault()
    void star(selected)
  }

  return starring
}

/**
 * The keys of the list that do something other than move: Enter goes to the Value field, and `*` stars the selected row (the
 * star buttons are not stops of the Tab key, so the keyboard has this).
 *
 * @param event the key press
 * @returns true if the key was one of them
 */
function actionKey(event: KeyboardEvent): boolean {
  if (event.key === 'Enter' && !onStar(event)) {
    focusValue(event)

    return true
  }

  return starKey(event)
}

/**
 * The keys of the list: Up and Down move the selection by a row, Page Up and Page Down by a page, Home and End to the first
 * and the last, and Enter goes to the Value field.
 *
 * @param event the key press
 */
function onKey(event: KeyboardEvent): void {
  if (!isPlain(event) || actionKey(event)) {
    return
  }
  if (moveSelection(event.key)) {
    event.preventDefault()
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

// A parameter that becomes the selected one by another way (the Related list, the changes, the arrows in the search) is
// scrolled into view. The focus is not moved.
watch(() => fields.selected.value, async () => {
  await nextTick()
  const byClick = clicked !== '' && clicked === fields.selected.value
  clicked = ''

  if (selectedAt.value >= 0 && !byClick) {
    reveal(selectedAt.value)
  }
})

/** Once the status has seen the selection change (in this flush), what the next change is is the user's. */
async function forgetSelectedByList(): Promise<void> {
  await nextTick()
  selectedByList = ''
}

/** Nothing to select (no row matches): the list is still left at the top, for the rows that come back. */
function emptyToTop(): void {
  if (rows.value.length === 0 && scroller.value) {
    scroller.value.scrollTop = 0
  }
}

/** The list is of another scope: the first row is selected and the list is at the top (once, whatever changed together). */
function toTop(): void {
  selectedByList = rows.value[0]?.param.id ?? ''
  selectAt(0)
  emptyToTop()
  void forgetSelectedByList()
}
// What is searched, which group is chosen, and which view: a change of any of them is a new list, from its top. The focus stays
// where it is (the typing in the search goes on).
watch([() => fields.filter.value, () => choice.chosen.value, view], toTop)

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
let forgetNav: (() => void) | undefined
onMounted(() => {
  measure()
  forgetNav = registerListNav(moveSelection)

  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(scroller.value)
  }
})
// A screen that was kept alive comes back with its scroll box scrolled to wherever the browser put it.
onActivated(measure)
onBeforeUnmount(() => {
  forgetNav?.()
  observer?.disconnect()
  cancelAnimationFrame(frame)
})

const status = computed(() => {
  const { list, missing } = fields
  const counts = { list: list.value, total: params.value.length, missing: missing.value, shown: visible.value.length }

  return listStatusText(counts, t)
})

// "Reset N changed to initial values": every parameter that is not at its initial value, but the counters that the vehicle keeps
// by itself (STAT_*). It queues them (the question names every one, and is the only confirmation).
const targets = computed(() => {
  const skip = (id: string) => isBookkeeping(id, fields.metadata.value.get(id))

  return resetTargets(params.value, fields.initial.value, skip)
})
// In Standard some of them may be hidden by the view: the button's help says so (it acts on all of the changed ones).
const resetAllHelp = computed(() => {
  const shownIds = new Set(listed.value.map(param => param.id))
  const hidden = targets.value.filter(target => !shownIds.has(target.id)).length
  const help = t('params.initial.resetAllHelp')

  return hidden > 0 ? `${help} ${t('params.view.resetHidden', { count: hidden })}` : help
})
const canReset = computed(() => {
  const idle = !parameters.lock.busy.value && fields.list.value !== 'loading' && fields.connection.value.state === 'connected'

  return idle && targets.value.length > 0
})

/** Queues the initial values of the changed parameters, and says so. */
function resetAll(): void {
  const count = staged.resetTo(targets.value)
  if (count > 0) {
    useToasts().push({ severity: 'success', text: t('params.initial.queued', { count }) })
  }
}

/** Takes the search and the group away, so that every parameter is shown again. */
function clear(): void {
  parameters.setFilter('')
  choice.choose('')
}
</script>
