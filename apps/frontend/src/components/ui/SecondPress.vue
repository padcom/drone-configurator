<template>
  <Button
    class="kit-second"
    :class="{ armed }"
    :disabled="disabled"
    aria-live="polite"
    @click="press"
    @blur="reset"
    @keydown="key"
  >
    {{ armed ? confirmLabel : label }}
  </Button>
</template>

<script setup lang="ts">
// A button for what cannot be undone (erasing logs) or what goes to a whole group: pressed once it says exactly what it
// will do ("Confirm: erase 5 logs", in the fault colour), and does it when pressed again. Left alone (a few seconds,
// another control, Escape) it goes back. A double click does not confirm: the second press has to come after a moment.
import { onBeforeUnmount, ref, watch } from 'vue'
import { SECOND_PRESS_MS } from '@/lib/app/safety'
import Button from './Button.vue'

/** The least time between the two presses: a double click is one press (ms). */
const BETWEEN_MS = 400

/** The most a pause may last (ms): a read of the list that takes longer than this disarms the button. */
const PAUSE_CAP_MS = 60_000

const props = withDefaults(defineProps<{
  /** What the button says at rest ("Erase all logs"). */
  label: string
  /** What it says after the first press: what exactly will happen ("Confirm: erase 5 logs"). */
  confirmLabel: string
  /** How long it waits for the second press (ms). It runs only while the button can be pressed. */
  waitMs?: number
  /** The button is off. An armed button that is turned off goes back, unless `pausing` says why. */
  disabled?: boolean
  /** The button is off because of what the first press asked for (the page reads again what the second press will act on). */
  pausing?: boolean
}>(), { waitMs: SECOND_PRESS_MS, disabled: false, pausing: false })

const emit = defineEmits<{
  /** The first press: the button now says what it will do (a place can bring what it counts up to date). */
  arm: []
  /** The second press: do it. */
  confirm: []
}>()

const armed = ref(false)
let armedAt = 0
let timer: ReturnType<typeof setTimeout> | undefined
// While the page reads again (see the watch below) the time of the second press does not run: how long the pause may last.
let paused = false
let cap: ReturnType<typeof setTimeout> | undefined

/** Goes back to its first state, whatever it was doing. */
function reset(): void {
  clearTimeout(timer)
  clearTimeout(cap)
  paused = false
  armed.value = false
}

/** Starts the time the second press is waited for. */
function wait(): void {
  armedAt = Date.now()
  timer = setTimeout(reset, props.waitMs)
}

// The first press may turn the button off while the page reads again what the second press will act on (`pausing`), which can
// take longer than the time given: the time then stops, and begins again when the button can be pressed, so that the second
// press can be made. A read that takes longer than PAUSE_CAP_MS disarms it. The button being off for any OTHER reason (the
// vehicle armed, a log without a checked copy, the list gone) disarms it at once: what was confirmed no longer holds, and a
// first press that is minutes old must not be the one that a single press confirms.
/** Stops the time of the second press, for at most PAUSE_CAP_MS. */
function pause(): void {
  if (!paused) {
    clearTimeout(timer)
    paused = true
    cap = setTimeout(reset, PAUSE_CAP_MS)
  }
}

/** Gives the second press its time again, from now. */
function unpause(): void {
  if (paused) {
    clearTimeout(cap)
    paused = false
    wait()
  }
}

/** What the button being turned off or on does to an armed one. */
function follow(): void {
  if (!props.disabled) {
    unpause()
  } else if (props.pausing) {
    pause()
  } else {
    reset()
  }
}

watch(() => [props.disabled, props.pausing], () => {
  if (armed.value) {
    follow()
  }
})

/** A press: the first arms it, a later second one does it. */
function press(): void {
  if (!armed.value) {
    armed.value = true
    wait()
    emit('arm')
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

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(cap)
})
</script>
