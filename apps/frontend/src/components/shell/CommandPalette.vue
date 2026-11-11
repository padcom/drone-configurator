
<template>
  <Dialog v-if="palette.open.value" bare class="palette" :title="t('palette.label')" @close="palette.hide()">
    <div class="palette-search">
      <Icon name="search" />
      <input
        id="palette-input"
        v-model="query"
        type="text"
        role="combobox"
        class="palette-input"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-autocomplete="list"
        :aria-activedescendant="activeId"
        :aria-label="t('palette.placeholder')"
        :placeholder="t('palette.placeholder')"
        autocomplete="off"
        spellcheck="false"
        data-initial-focus
        @keydown="onKey"
      />
    </div>
    <ul id="palette-list" role="listbox" class="palette-list" :aria-label="t('palette.list')">
      <li
        v-for="(row, at) in rows"
        :id="`palette-option-${row.command.id}`"
        :key="row.command.id"
        role="option"
        class="palette-row"
        :class="{ active: at === active, disabled: row.reason !== null }"
        :aria-selected="at === active ? 'true' : 'false'"
        :aria-disabled="row.reason !== null ? 'true' : undefined"
        :aria-describedby="row.reason !== null ? `palette-reason-${row.command.id}` : undefined"
        :data-command="row.command.id"
        @mousedown.prevent
        @mousemove="hover($event, at)"
        @click="run(row)"
      >
        <span class="palette-icon" aria-hidden="true"><Icon v-if="row.command.icon" :name="row.command.icon" /></span>
        <span class="palette-label">{{ row.label }}</span>
        <span class="palette-group">{{ row.group }}</span>
        <kbd class="palette-key">{{ row.hint }}</kbd>
        <span v-if="row.reason !== null" :id="`palette-reason-${row.command.id}`" class="palette-reason">{{ row.reason }}</span>
      </li>
    </ul>
    <p v-if="rows.length === 0" class="palette-empty">{{ t('palette.empty', { query: query.trim() }) }}</p>
    <p class="visually-hidden palette-status" role="status" aria-live="polite">{{ announced }}</p>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from '@/components/ui/Dialog.vue'
import Icon from '@/components/ui/Icon.vue'
import type { Command } from '@/lib/commands/command'
import { useCommandContext, useCommands } from '@/composables/useCommands'
import { useCommandRunner } from '@/composables/useCommandRunner'
import { useCommandPalette } from '@/composables/useCommandPalette'

// The command palette: a search box over the commands of the application (lib/commands). It lists, filters, shows why a command
// may not run, and calls `invoke` of the registry; it has no behaviour of its own. Built on the kit's dialog (a modal over the
// native <dialog>: the page behind it is inert, Escape closes it, the focus goes back to what had it), with the ARIA pattern of a
// combobox over a listbox: the focus stays in the input, the row that Enter would run is `aria-activedescendant`.
const { t } = useI18n()
const palette = useCommandPalette()
const registry = useCommands()
const ctx = useCommandContext()
const runCommand = useCommandRunner()

/** How many rows PageUp and PageDown move by. */
const PAGE = 8

/** How long the count is left alone before it is announced (ms): not on every key. */
const ANNOUNCE_MS = 400

/** How long after the palette opens its count is announced, and after a reason is asked for (ms): the region is there first. */
const OPEN_ANNOUNCE_MS = 100

/** How long after the selection was moved with the keys a mouse movement is taken for the scroll's, not the user's (ms). */
const KEYBOARD_QUIET_MS = 250

/** One row of the list. */
interface Row {
  command: Command
  label: string
  group: string
  hint: string
  /** Why it may not run, or null when it may. */
  reason: string | null
}

const query = ref('')
const active = ref(0)
const announced = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
/** Whether the palette is just being opened (its state is being put back to the start). */
let opening = false
/** Where the pointer was at the last mouse movement over a row, and when the selection was last moved with the keys. */
let pointer = { x: Number.NaN, y: Number.NaN }
let keyboardAt = Number.NEGATIVE_INFINITY

const rows = computed<Row[]>(() => registry.search(query.value, ctx).map(command => {
  const availability = command.isEnabled(ctx)

  return {
    command,
    label: ctx.say(command.labelKey),
    group: ctx.say(command.groupKey),
    hint: command.shortcut ?? '',
    reason: availability.enabled ? null : ctx.say(availability.reasonKey, availability.reasonParams),
  }
}))

const activeId = computed(() => {
  const row = rows.value[active.value]

  return row === undefined ? undefined : `palette-option-${row.command.id}`
})

/**
 * The words for how many commands the list has: the count, or that nothing matches.
 *
 * @returns the text for the live region
 */
function countText(): string {
  const count = rows.value.length

  return count === 0 ? t('palette.empty', { query: query.value.trim() }) : t('palette.count', { count }, count)
}

/**
 * Says something through the live region: the region is emptied first and filled after `after` ms, so that the same words
 * said twice (a disabled command's reason, asked for again) are spoken again, and a region that was only just made is already
 * there when it is filled. Only the last thing said counts.
 *
 * @param text what to say, as a function, so that it is worked out when it is said (the list may have changed since)
 * @param after how long to wait first (ms)
 */
function announce(text: () => string, after: number): void {
  clearTimeout(timer)
  announced.value = ''
  timer = setTimeout(() => {
    announced.value = text()
  }, after)
}

/**
 * The first row that may run: the one Enter runs when nothing was selected yet.
 *
 * @returns its index, or 0 when none may
 */
function firstEnabled(): number {
  return Math.max(0, rows.value.findIndex(row => row.reason === null))
}

/** The list changed with the query: the first row is the one to run, and the new count is announced a moment later. */
watch(query, () => {
  active.value = firstEnabled()

  // (Not when the opening cleared the query: it announces the count itself, sooner.)
  if (!opening) {
    announce(countText, ANNOUNCE_MS)
  }
})

/** Every opening starts afresh: no old query, the first row that may run selected, nothing left of the last count. */
watch(palette.open, async open => {
  if (open) {
    opening = true
    query.value = ''
    active.value = firstEnabled()
    announce(countText, OPEN_ANNOUNCE_MS)
    await nextTick()
    opening = false
  }
})

watch(active, async () => {
  await nextTick()
  document.getElementById(activeId.value ?? '')?.scrollIntoView?.({ block: 'nearest' })
})

onBeforeUnmount(() => clearTimeout(timer))

/**
 * Waits until the palette is gone and has given the focus back to what had it before it opened. A confirmation that the command
 * asks for opens next, and the element it remembers to give the focus back to is the one that has it when it opens: if that were
 * still the palette's input (about to be removed), the focus would be lost to the page when the question is answered.
 */
async function focusSettled(): Promise<void> {
  await nextTick()
  // The dialog gives the focus back a task after it closes: a task queued now runs after it.
  await new Promise<void>(resolve => {
    setTimeout(resolve, 0)
  })
}

/**
 * Runs a command through the registry, the one way a command runs. The palette is closed first (a confirmation the command asks
 * for must not open under it). A command that may not run says why, and nothing happens.
 *
 * @param row the row
 */
async function run(row: Row): Promise<void> {
  if (row.reason !== null) {
    announce(() => row.reason ?? '', OPEN_ANNOUNCE_MS)

    return
  }
  palette.hide()
  await focusSettled()
  // The focus and the toast of a command that did not run follow the same way as from the rail and the buttons.
  await runCommand(row.command, 'palette')
}

/**
 * Moves the selection, round at the ends.
 *
 * @param by how many rows (negative: up)
 * @param wrap whether to go round the ends (arrows) or stop at them (pages)
 */
function move(by: number, wrap: boolean): void {
  const count = rows.value.length
  if (count > 0) {
    const next = active.value + by
    active.value = wrap ? (next % count + count) % count : Math.min(count - 1, Math.max(0, next))
  }
}

/** Runs the row that is selected. */
function runActive(): void {
  const row = rows.value[active.value]
  if (row !== undefined) {
    run(row)
  }
}

/** What each key does in the input. */
const KEYS: Record<string, () => void> = {
  ArrowDown: () => move(1, true),
  ArrowUp: () => move(-1, true),
  PageDown: () => move(PAGE, false),
  PageUp: () => move(-PAGE, false),
  Home: () => {
    active.value = 0
  },
  End: () => {
    active.value = Math.max(0, rows.value.length - 1)
  },
  Enter: runActive,
}

/** Home and End are the caret's own once there is text (the rule the other fields follow). */
const CARET_KEYS = new Set(['Home', 'End'])

/**
 * Whether a key press carries a modifier or is part of composing text: not for the palette.
 *
 * @param event the key press
 * @returns true when it does
 */
function modified(event: KeyboardEvent): boolean {
  return event.isComposing || event.ctrlKey || event.altKey || event.metaKey
}

/**
 * What a key press does in the input, if it is one of the palette's keys.
 *
 * @param event the key press
 * @returns what to do, or undefined when the key is the input's own
 */
function handlerFor(event: KeyboardEvent): (() => void) | undefined {
  if (modified(event)) {
    return undefined
  }

  return CARET_KEYS.has(event.key) && query.value !== '' ? undefined : KEYS[event.key]
}

/**
 * The keys of the input.
 *
 * @param event the key press
 */
function onKey(event: KeyboardEvent): void {
  const handler = handlerFor(event)
  if (handler !== undefined) {
    event.preventDefault()
    keyboardAt = performance.now()
    handler()
  }
}

/**
 * The pointer moved over a row: it is the selected one. Only a real movement counts: scrolling a row into view under a pointer
 * that is at rest makes the browser send a mouse movement, with the same position or just after a key moved the selection, and
 * that must not take the selection back from the keyboard.
 *
 * @param event the mouse movement
 * @param at the row's index
 */
function hover(event: MouseEvent, at: number): void {
  const still = event.clientX === pointer.x && event.clientY === pointer.y
  pointer = { x: event.clientX, y: event.clientY }

  if (!still && performance.now() - keyboardAt > KEYBOARD_QUIET_MS) {
    active.value = at
  }
}
</script>
