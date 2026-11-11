<template>
  <Button class="kit-second" :class="{ armed }" aria-live="polite" @click="press" @blur="reset" @keydown="key">
    {{ armed ? confirmLabel : label }}
  </Button>
</template>

<script setup lang="ts">
// A button for what cannot be undone (erasing logs) or what goes to a whole group: pressed once it says exactly what it
// will do ("Confirm: erase 5 logs", in the fault colour), and does it when pressed again. Left alone (a few seconds,
// another control, Escape) it goes back. A double click does not confirm: the second press has to come after a moment.
import { onBeforeUnmount, ref } from 'vue'
import { SECOND_PRESS_MS } from '@/lib/app/safety'
import Button from './Button.vue'

/** The least time between the two presses: a double click is one press (ms). */
const BETWEEN_MS = 400

const props = withDefaults(defineProps<{
  /** What the button says at rest ("Erase all logs"). */
  label: string
  /** What it says after the first press: what exactly will happen ("Confirm: erase 5 logs"). */
  confirmLabel: string
  /** How long it waits for the second press (ms). */
  waitMs?: number
}>(), { waitMs: SECOND_PRESS_MS })

const emit = defineEmits<{
  /** The second press: do it. */
  confirm: []
}>()

const armed = ref(false)
let armedAt = 0
let timer: ReturnType<typeof setTimeout> | undefined

/** Goes back to its first state. */
function reset(): void {
  clearTimeout(timer)
  armed.value = false
}

/** A press: the first arms it, a later second one does it. */
function press(): void {
  if (!armed.value) {
    armed.value = true
    armedAt = Date.now()
    timer = setTimeout(reset, props.waitMs)
  } else if (Date.now() - armedAt >= BETWEEN_MS) {
    reset()
    emit('confirm')
  }
}

/**
 * A key on the button: Escape takes it back, and a key that repeats does nothing. Chromium clicks a focused button on every
 * repeat of a held Enter (about half a second after the first), which would be taken for the second press: a destructive
 * button must not be confirmed by one key leaned on, so the repeat is cancelled before it can click.
 *
 * @param event the key event
 */
function key(event: KeyboardEvent): void {
  if (event.repeat) {
    event.preventDefault()
  } else if (event.key === 'Escape') {
    reset()
  }
}

onBeforeUnmount(() => clearTimeout(timer))
</script>
