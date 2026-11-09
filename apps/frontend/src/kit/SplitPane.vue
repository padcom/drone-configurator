<template>
  <div ref="root" class="kit-split" :class="direction" :style="{ '--split': `${model}%` }">
    <div class="first"><slot name="first" /></div>
    <div
      class="separator"
      :class="{ dragging }"
      role="separator"
      tabindex="0"
      :aria-label="label"
      :aria-orientation="direction === 'row' ? 'vertical' : 'horizontal'"
      :aria-valuenow="model"
      :aria-valuemin="min"
      :aria-valuemax="max"
      @keydown="resize"
      @pointerdown="start"
      @pointermove="drag"
      @pointerup="stop"
      @pointercancel="stop"
    />
    <div class="second"><slot name="second" /></div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Two panes with a bar between them. The bar is a separator that can be focused: the arrow keys across the split move
// it by 5 %, Home and End go to the smallest and the largest first pane, and it can be dragged with the pointer.
// `aria-valuenow` is the size of the first pane in percent.
const model = defineModel<number>({ default: 50 })

const props = withDefaults(defineProps<{
  /** What the bar is for a screen reader ("Resize the panes"). */
  label: string
  /** `row`: the panes side by side. `column`: one above the other. */
  direction?: 'row' | 'column'
  /** The smallest the first pane may be, in percent. */
  min?: number
  /** The largest the first pane may be, in percent. */
  max?: number
}>(), { direction: 'row', min: 10, max: 90 })

const STEP = 5
const root = ref<HTMLElement | null>(null)
const dragging = ref(false)

/**
 * Sets the size of the first pane, kept between the smallest and the largest.
 *
 * @param percent the size asked for
 */
function setSize(percent: number): void {
  model.value = Math.min(props.max, Math.max(props.min, Math.round(percent)))
}

/**
 * Where each key moves the bar, given the direction of the split: the change in percent, or the size it goes to.
 *
 * @param key the key
 * @returns a function from the current size to the new one, or nothing for a key that does nothing here
 */
function target(key: string): ((size: number) => number) | undefined {
  const forward = props.direction === 'row' ? 'ArrowRight' : 'ArrowDown'
  const back = props.direction === 'row' ? 'ArrowLeft' : 'ArrowUp'
  const keys: Record<string, (size: number) => number> = {
    [forward]: size => size + STEP,
    [back]: size => size - STEP,
    Home: () => props.min,
    End: () => props.max,
  }

  return keys[key]
}

/**
 * Moves the bar with the keyboard.
 *
 * @param event the key press on the bar
 */
function resize(event: KeyboardEvent): void {
  const next = target(event.key)
  if (next) {
    event.preventDefault()
    setSize(next(model.value))
  }
}

/**
 * Starts a drag: the pointer is captured, so the bar follows it also outside its own few pixels.
 *
 * @param event the press on the bar
 */
function start(event: PointerEvent): void {
  const bar = event.currentTarget as HTMLElement

  dragging.value = true
  bar.setPointerCapture?.(event.pointerId)
}

/**
 * How far along the split the pointer is, from 0 (the start) to 1 (the end).
 *
 * @param event the pointer's event
 * @returns the fraction, or nothing when the split has no box (it is not on the page)
 */
function along(event: PointerEvent): number | undefined {
  const box = root.value?.getBoundingClientRect()
  if (!box) {
    return undefined
  }

  return props.direction === 'row' ? (event.clientX - box.left) / box.width : (event.clientY - box.top) / box.height
}

/**
 * Follows the pointer while it is dragging the bar.
 *
 * @param event the pointer's move
 */
function drag(event: PointerEvent): void {
  const fraction = along(event)
  if (dragging.value && fraction !== undefined) {
    setSize(fraction * 100)
  }
}

/** Ends a drag. */
function stop(): void {
  dragging.value = false
}
</script>
