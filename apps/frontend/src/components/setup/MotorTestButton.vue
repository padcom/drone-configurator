<template>
  <button
    type="button"
    class="motor-test-button"
    :class="{ held }"
    :disabled="disabled"
    :aria-pressed="held ? 'true' : 'false'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="release"
    @pointercancel="release"
    @pointerleave="release"
    @lostpointercapture="release"
    @keydown="onKeyDown"
    @keyup="onKeyUp"
    @blur="release"
    @contextmenu.prevent
    @click.prevent
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
// A button that is HELD: it says `press` when it goes down and `release` when it lets go, by any way it can: the pointer going
// up, being cancelled, leaving the button or losing its capture; a key (Space or Enter) going up; the button losing the focus;
// the button being disabled; the button going away. A key that is held down and repeats is the same one press (the repeats are
// ignored). A click is not a press: only what is held counts, and a tap that does not hold is a press and a release at once.
// Nothing else starts it.
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  /** The button cannot be pressed now (a press that is held is let go). */
  disabled?: boolean
}>()

const emit = defineEmits<{
  press: []
  release: []
}>()

const held = ref(false)

/** Starts the press, once. */
function press(): void {
  if (!held.value && props.disabled !== true) {
    held.value = true
    emit('press')
  }
}

/** Ends the press, once, whichever way it ends. */
function release(): void {
  if (held.value) {
    held.value = false
    emit('release')
  }
}

/**
 * The primary button of a pointer goes down.
 *
 * @param event the pointer event
 */
function onPointerDown(event: PointerEvent): void {
  if (event.button === 0 && event.isPrimary !== false) {
    press()
  }
}

/**
 * Whether a value is from one end to the other, ends included.
 *
 * @param value the value
 * @param from the least
 * @param to the most
 * @returns true if it is
 */
function between(value: number, from: number, to: number): boolean {
  return value >= from && value <= to
}

/**
 * The pointer moves while the button is held: off the button is a release. (A finger is captured by the button it went down on,
 * so it never "leaves" it: where it is, is looked at.)
 *
 * @param event the pointer event
 */
function onPointerMove(event: PointerEvent): void {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const inside = between(event.clientX, box.left, box.right) && between(event.clientY, box.top, box.bottom)
  if (held.value && !inside) {
    release()
  }
}

/**
 * Whether a key is one that holds the button.
 *
 * @param event the key event
 * @returns true for Space and Enter
 */
function holds(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Enter'
}

/**
 * A key goes down: Space or Enter holds the button; the repeats of a key that stays down are ignored.
 *
 * @param event the key event
 */
function onKeyDown(event: KeyboardEvent): void {
  if (holds(event)) {
    event.preventDefault()

    if (!event.repeat) {
      press()
    }
  }
}

/**
 * A key goes up: that is the release.
 *
 * @param event the key event
 */
function onKeyUp(event: KeyboardEvent): void {
  if (holds(event)) {
    event.preventDefault()
    release()
  }
}

// A button that stops being usable while it is held lets go, and so does one that is removed.
watch(() => props.disabled, disabled => disabled === true && release())
onBeforeUnmount(release)
</script>
