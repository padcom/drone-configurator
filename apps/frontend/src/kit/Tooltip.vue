<template>
  <span class="kit-tooltip-host" @mouseenter="show" @mouseleave="hide" @focusin="show" @focusout="hide" @keydown.esc="escape">
    <slot :describedby="shown ? id : undefined" />
    <span v-if="shown" :id="id" class="kit-tooltip" role="tooltip">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
// A word of help for a control: shown when the pointer is on it or the focus is in it, hidden when either leaves and with
// Escape. It is light on dark (inverted), so it stands out of a dark page, and it says nothing that is not also available
// elsewhere: it is a help, never the only place for something. The control inside gets `describedby` from the slot, so a
// screen reader reads the tooltip with it:
//   <Tooltip text="Written to the vehicle and read back" v-slot="{ describedby }"><Button :aria-describedby="describedby">…
import { ref, useId } from 'vue'

defineProps<{
  /** The help. */
  text: string
}>()

const id = useId()
const shown = ref(false)

/** Shows the tooltip. */
function show(): void {
  shown.value = true
}

/** Hides the tooltip. */
function hide(): void {
  shown.value = false
}

/**
 * Escape hides the tooltip, and stays here while it does (in a dialog it would close the dialog too).
 *
 * @param event the key event
 */
function escape(event: KeyboardEvent): void {
  if (shown.value) {
    event.preventDefault()
    event.stopPropagation()
    hide()
  }
}
</script>
