<template>
  <svg ref="root" class="map-svg" :width="size.width" :height="size.height" :viewBox="`0 0 ${size.width} ${size.height}`">
    <polyline v-if="line" :points="line" class="plan-route" aria-hidden="true" />
    <g
      v-for="pin in placed"
      :key="pin.id"
      class="plan-pin"
      :class="{ selected: pin.id === selected }"
      :transform="`translate(${pin.at.x.toFixed(1)} ${pin.at.y.toFixed(1)})`"
      role="button"
      :tabindex="pin.id === tabStop ? 0 : -1"
      :aria-pressed="pin.id === selected"
      :aria-label="t('plan.map.pin', { number: pin.number })"
      :data-pin="pin.id"
      :data-lat="pin.lat"
      :data-lon="pin.lon"
      @pointerdown.stop
      @focus="focused = pin.id"
      @click="state.select(pin.id)"
      @keydown.enter.prevent="state.select(pin.id)"
      @keydown.space.prevent="state.select(pin.id)"
      @keydown.delete.prevent="remove($event, pin.id)"
      @keydown="move($event, pin.id)"
    >
      <circle r="14" />
      <text y="5" text-anchor="middle">{{ pin.number }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
// The plan over the map: its route in the route colour (and no other line has it), the items that have a place as numbered pins
// (the numbers the list has), the selected one marked. A pin selects its item, with a pointer or with Enter or Space, and Delete
// takes it out (Undo gives it back). The pins
// are ONE tab stop (the focused one, else the selected one, else the first): the arrows, Home and End move between them, so a
// plan of a thousand items does not put a thousand stops between the map and the list. The pins are where the places say, so
// they move with the map; moving them is the next part of the editing.
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlan } from '@/composables/usePlan'
import type { Point, Size } from '@/lib/map/geo'

const props = defineProps<{
  /** Where a position is on the screen of the map. */
  place: (lat: number, lon: number) => Point
  /** The size of the map. */
  size: Size
}>()

/** Where each key goes from the pin at `index` of `count`. */
const STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: index => index + 1,
  ArrowDown: index => index + 1,
  ArrowLeft: index => index - 1,
  ArrowUp: index => index - 1,
  Home: () => 0,
  End: (_index, count) => count - 1,
}

const { t } = useI18n()
const state = usePlan()
const { pins, selected } = state
const root = ref<SVGElement | null>(null)
/** The pin that has the focus, or had it last. */
const focused = ref<number | null>(null)
const placed = computed(() => pins.value.map(pin => ({ ...pin, at: props.place(pin.lat, pin.lon) })))
/** The pin that is the tab stop. */
const tabStop = computed(() => {
  const ids = pins.value.map(pin => pin.id)

  return [focused.value, selected.value].find(id => id !== null && ids.includes(id)) ?? ids[0] ?? null
})
/** The route as the points of an SVG polyline: nothing for fewer than two places. */
const line = computed(() => {
  const points = placed.value.map(pin => `${pin.at.x.toFixed(1)},${pin.at.y.toFixed(1)}`)

  return points.length < 2 ? '' : points.join(' ')
})

/**
 * The pin a key goes to from another: the one the step says, kept within the pins.
 *
 * @param step what the key does to the position
 * @param id the pin it is pressed on
 * @returns the id of the pin to go to
 */
function neighbour(step: (index: number, count: number) => number, id: number): number {
  const ids = pins.value.map(pin => pin.id)

  return ids[Math.min(Math.max(step(ids.indexOf(id), ids.length), 0), ids.length - 1)] ?? id
}

/**
 * The map an overlay is on.
 *
 * @param overlay the overlay's svg
 * @returns the map's element, or null
 */
function mapOf(overlay: SVGElement | null): HTMLElement | null {
  return overlay?.closest<HTMLElement>('.map') ?? null
}

/** Puts the focus on the pin of the selected item, or on the map when there is none (a pin that was focused is gone). */
function focusSelected(): void {
  const target = root.value?.querySelector<SVGElement>(`[data-pin="${selected.value}"]`) ?? mapOf(root.value)

  target?.focus()
}

/**
 * Delete or Backspace on a pin takes its item out of the plan (Undo gives it back, so it does not ask). The focus goes to the pin
 * of the item that is selected then, or to the map when there is none. A key held down takes out one item, not the next and the
 * next (the focus moves on with each).
 *
 * @param event the key event
 * @param id the pin
 */
async function remove(event: KeyboardEvent, id: number): Promise<void> {
  if (event.repeat) {
    return
  }
  state.select(id)
  state.remove()
  await nextTick()
  focusSelected()
}

/**
 * What a key does to the position among the pins (a key with a modifier is the browser's, not the map's).
 *
 * @param event the key event
 * @returns the step, or undefined for a key that does not move
 */
function stepOf(event: KeyboardEvent): ((index: number, count: number) => number) | undefined {
  return event.ctrlKey || event.metaKey || event.altKey ? undefined : STEPS[event.key]
}

/**
 * An arrow, Home or End on a pin moves the focus to another pin (the map does not pan with it).
 *
 * @param event the key event
 * @param id the pin it is on
 */
function move(event: KeyboardEvent, id: number): void {
  const step = stepOf(event)
  if (step) {
    event.preventDefault()
    event.stopPropagation()
    root.value?.querySelector<SVGElement>(`[data-pin="${neighbour(step, id)}"]`)?.focus()
  }
}
</script>
