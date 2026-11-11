
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
        @mousemove="active = at"
        @click="run(row)"
      >
        <span class="palette-label">{{ row.label }}</span>
        <span class="palette-group">{{ row.group }}</span>
        <kbd class="palette-key">{{ row.hint }}</kbd>
        <span v-if="row.reason !== null" :id="`palette-reason-${row.command.id}`" class="palette-reason">{{ row.reason }}</span>
      </li>
    </ul>
    <p v-if="rows.length === 0" class="palette-empty">{{ t('palette.empty', { query: query.trim() }) }}</p>
    <p class="visually-hidden" role="status" aria-live="polite">{{ announced }}</p>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from '@/components/ui/Dialog.vue'
import Icon from '@/components/ui/Icon.vue'
import type { Command, InvokeResult } from '@/lib/commands/command'
import { useCommandContext, useCommands } from '@/composables/useCommands'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { useToasts } from '@/composables/toasts'

// The command palette: a search box over the commands of the application (lib/commands). It lists, filters, shows why a command
// may not run, and calls `invoke` of the registry; it has no behaviour of its own. Built on the kit's dialog (a modal over the
// native <dialog>: the page behind it is inert, Escape closes it, the focus goes back to what had it), with the ARIA pattern of a
// combobox over a listbox: the focus stays in the input, the row that Enter would run is `aria-activedescendant`.
const { t } = useI18n()
const palette = useCommandPalette()
const registry = useCommands()
const ctx = useCommandContext()
const toasts = useToasts()

/** How many rows PageUp and PageDown move by. */
const PAGE = 8

/** How long the count is left alone before it is announced (ms): not on every key. */
const ANNOUNCE_MS = 400

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

/** The list changed with the query: the first row is the one to run, and the new count is announced a moment later. */
watch(query, () => {
  active.value = 0
  clearTimeout(timer)
  timer = setTimeout(() => {
    announced.value = countText()
  }, ANNOUNCE_MS)
})

// The count is said when the palette opens, too.
announced.value = countText()

watch(active, async () => {
  await nextTick()
  document.getElementById(activeId.value ?? '')?.scrollIntoView?.({ block: 'nearest' })
})

onBeforeUnmount(() => clearTimeout(timer))

/**
 * Puts the focus in the screen that a command opened: the element that had it before the palette opened is in a screen that is
 * hidden now. After the dialog has given the focus back (a task later), so that this is the last word.
 */
function focusScreen(): void {
  setTimeout(() => {
    setTimeout(() => document.querySelector<HTMLElement>('.app-main')?.focus(), 0)
  }, 0)
}

/**
 * Says that a command that was asked for did not run: it failed, or it could no longer run.
 *
 * @param result how the command ended
 */
function complain(result: InvokeResult): void {
  if (result.status === 'failed') {
    toasts.push({ id: 'command-failed', severity: 'error', text: t('palette.failed') })
  } else if (result.status === 'disabled') {
    toasts.push({ id: 'command-disabled', severity: 'warning', text: ctx.say(result.reasonKey, result.reasonParams) })
  }
}

/**
 * What follows a command: the focus goes where the command says, or the user is told it did not run.
 *
 * @param result how the command ended
 */
function afterRun(result: InvokeResult): void {
  if (result.status !== 'done') {
    complain(result)
  } else if (result.outcome.focus === 'main') {
    focusScreen()
  }
}

/**
 * Runs a command through the registry, the one way a command runs. The palette is closed first (a confirmation the command asks
 * for must not open under it). A command that may not run says why, and nothing happens.
 *
 * @param row the row
 */
async function run(row: Row): Promise<void> {
  if (row.reason !== null) {
    announced.value = row.reason

    return
  }
  palette.hide()
  afterRun(await registry.invoke(row.command, ctx))
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
    handler()
  }
}
</script>
