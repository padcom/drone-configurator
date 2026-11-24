<template>
  <div ref="root" class="kit-popover" @focusout="leave">
    <button
      :id="triggerId"
      ref="trigger"
      type="button"
      class="trigger"
      :aria-label="label"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? panelId : undefined"
      @click="toggle"
      @keydown.esc="escape"
    >
      <slot name="trigger" />
    </button>
    <div
      v-if="open"
      :id="panelId"
      ref="panel"
      class="panel"
      role="dialog"
      tabindex="-1"
      :aria-labelledby="titleId"
      @keydown.esc="escape"
    >
      <h2 :id="titleId" class="panel-title">{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
// A button that shows more about something next to it: a panel (a dialog that is not modal) under the button, with a title.
// The button opens and closes it, and says whether it is open; the focus goes to the panel when it opens, so a screen reader
// reads it. Escape closes it and puts the focus back on the button; the focus or a press elsewhere closes it too. It holds
// what can be read, never an action that must be done: the page works without opening it.
import { nextTick, onBeforeUnmount, ref, useId } from 'vue'

defineProps<{
  /** The name of the button (what it shows and that it opens the details). */
  label: string
  /** The title of the panel. */
  title: string
}>()

const triggerId = useId()
const panelId = useId()
const titleId = useId()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const open = ref(false)
/** Ends the listening for a press elsewhere, while the panel is open. */
let listening: AbortController | undefined

/**
 * Closes the panel.
 *
 * @param back whether the focus goes back to the button
 */
function close(back: boolean): void {
  open.value = false
  listening?.abort()
  listening = undefined

  if (back) {
    trigger.value?.focus()
  }
}

/**
 * Whether something is outside the button and the panel.
 *
 * @param target what was pressed or focused
 * @returns true when it is elsewhere
 */
function isOutside(target: EventTarget | null): boolean {
  return target !== null && !root.value?.contains(target as Node)
}

/**
 * A press anywhere outside closes the panel.
 *
 * @param event the press
 */
function outside(event: Event): void {
  if (isOutside(event.target)) {
    close(false)
  }
}

/** Opens the panel and moves the focus into it. */
async function show(): Promise<void> {
  open.value = true
  listening = new AbortController()
  document.addEventListener('pointerdown', outside, { signal: listening.signal })
  await nextTick()
  panel.value?.focus()
}

/** The button was pressed: opens or closes. */
function toggle(): void {
  if (open.value) {
    close(false)
  } else {
    void show()
  }
}

/**
 * Escape closes an open panel, and stays here while it does (in a dialog it would close the dialog too).
 *
 * @param event the key event
 */
function escape(event: KeyboardEvent): void {
  if (open.value) {
    event.preventDefault()
    event.stopPropagation()
    close(true)
  }
}

/**
 * The focus left: when it went out of the button and the panel, the panel closes.
 *
 * @param event the focus event
 */
function leave(event: FocusEvent): void {
  if (open.value && isOutside(event.relatedTarget)) {
    close(false)
  }
}

onBeforeUnmount(() => listening?.abort())
</script>
