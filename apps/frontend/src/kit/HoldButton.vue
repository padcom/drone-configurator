<template>
  <button
    class="kit-button kit-hold"
    :class="{ holding, danger }"
    type="button"
    :style="{ '--hold-ms': `${holdMs}ms` }"
    @pointerdown.left="begin"
    @pointerleave="end"
    @pointercancel="end"
    @blur="end"
    @keydown="keyDown"
    @keyup="keyUp"
    @click.prevent
  >
    <svg class="kit-hold-ring" viewBox="0 0 20 20" aria-hidden="true">
      <circle class="kit-hold-track" cx="10" cy="10" r="8" />
      <circle class="kit-hold-fill" cx="10" cy="10" r="8" />
    </svg>
    <slot />
  </button>
</template>

<script setup lang="ts">
// A button that is pressed and held: it does its thing once, when it has been held for `holdMs`, and letting go before
// that does nothing. A click, a double click, the Enter or Space that is only tapped, a key that repeats while it is held,
// a press that was meant for something else under it (the first `armMs` after it appears) and a pointer that leaves the
// button all fail to confirm. A ring fills while it is held. It is for what changes how the vehicle flies.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{
  /** How long to hold, in milliseconds. */
  holdMs: number
  /** How long after it appears it ignores presses, in milliseconds. */
  armMs?: number
  /** Draws it as a dangerous action (the words say so too). */
  danger?: boolean
}>(), { armMs: 0, danger: false })

const emit = defineEmits<{
  /** The button has been held long enough. Once per hold. */
  held: []
}>()

const holding = ref(false)
let armed = props.armMs <= 0
let timer: ReturnType<typeof setTimeout> | undefined
let source = ''
let armTimer: ReturnType<typeof setTimeout> | undefined

/** Stops waiting for the hold to be long enough. */
function end(): void {
  clearTimeout(timer)
  timer = undefined
  holding.value = false
  source = ''
}

/** The hold was long enough (the ring stays full, and nothing more happens, until the button is let go). */
function done(): void {
  timer = undefined
  emit('held')
}

/**
 * Starts a hold.
 *
 * @param by what holds the button: the pointer or a key
 */
function start(by: string): void {
  if (!armed || source !== '') {
    return
  }
  source = by
  holding.value = true
  timer = setTimeout(done, props.holdMs)
}

/** The pointer went down on the button; letting go anywhere ends the hold. */
function begin(): void {
  start('pointer')
  window.addEventListener('pointerup', end, { once: true })
}

/**
 * A key went down: Space and Enter hold the button (not their repeats, and not as a click).
 *
 * @param event the key event
 */
function keyDown(event: KeyboardEvent): void {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()

    if (!event.repeat) {
      start(event.key)
    }
  }
}

/**
 * A key went up: if it is the one that holds the button, the hold is over.
 *
 * @param event the key event
 */
function keyUp(event: KeyboardEvent): void {
  if (event.key === source) {
    end()
  }
}

onMounted(() => {
  if (!armed) {
    armTimer = setTimeout(() => {
      armed = true
    }, props.armMs)
  }
})

onBeforeUnmount(() => {
  clearTimeout(armTimer)
  clearTimeout(timer)
  window.removeEventListener('pointerup', end)
})
</script>
