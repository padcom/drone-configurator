<template>
  <div ref="root" class="kit-popover kit-drop-panel" @focusout="leave">
    <button
      :id="triggerId"
      ref="trigger"
      type="button"
      class="trigger"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? panelId : undefined"
      @click="toggle"
      @keydown.esc="escape"
    >
      <Icon v-if="icon" :name="icon" />
      <span class="label">{{ label }}</span>
      <!-- Inside the button, so part of its name ("Filters 1"). -->
      <span v-if="count > 0" class="kit-badge info count">{{ countText ?? count }}</span>
      <Icon name="chevron-down" />
    </button>
    <!-- Not modal: a group of controls under the button, named by its title. It stays open while they are used. -->
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
      <div class="drop-panel-body">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// A button that opens a panel of controls under it (filters, view options): what a toolbar holds when it has no room to show
// them all. The button says how many of them are in force (a badge, part of its name) and whether the panel is open; the panel
// takes the focus when it opens, and Tab goes through its controls; it stays open while they are used. Escape closes it and puts
// the focus back on the button; the focus or a press elsewhere closes it too. Unlike Popover (which only shows what can be read),
// it holds actions.
import { nextTick, onBeforeUnmount, ref, useId } from 'vue'
import Icon from './Icon.vue'
import type { IconName } from '@/lib/ui/icons'

withDefaults(defineProps<{
  /** What the button says. */
  label: string
  /** The title of the panel. */
  title: string
  /** How many of the panel's settings are not their usual one: a badge on the button when there are any. */
  count?: number
  /** What the badge says for a screen reader and the eye, when not the bare number. */
  countText?: string
  /** An icon before the words. */
  icon?: IconName
}>(), { count: 0, countText: undefined, icon: undefined })

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
