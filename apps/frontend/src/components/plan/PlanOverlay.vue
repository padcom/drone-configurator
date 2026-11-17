<template>
  <svg
    ref="root"
    class="map-svg"
    :width="size.width"
    :height="size.height"
    :viewBox="`0 0 ${size.width} ${size.height}`"
    @keydown.esc="grip.cancel()"
  >
    <desc id="plan-pin-help">{{ t('plan.map.pinHelp') }}</desc>
    <polyline v-if="line" :points="line" class="plan-route" aria-hidden="true" />
    <line
      v-for="segment in segments"
      :key="segment.id"
      class="plan-segment"
      aria-hidden="true"
      :x1="segment.from.x"
      :y1="segment.from.y"
      :x2="segment.to.x"
      :y2="segment.to.y"
      @pointerdown.stop="grip.begin($event, 'insert', segment.id)"
      @pointermove="grip.move($event)"
      @pointerup="grip.end($event)"
      @pointercancel="grip.cancel()"
    />
    <g v-if="ghost" class="plan-pin ghost" :transform="translate(ghost.at)" aria-hidden="true">
      <circle r="14" />
      <text y="5" text-anchor="middle">{{ ghost.number }}</text>
    </g>
    <g
      v-for="pin in placed"
      :key="pin.id"
      class="plan-pin"
      :class="{ selected: pin.id === selected, error: pin.flag === 'error', warning: pin.flag === 'warning' }"
      :transform="translate(pin.at)"
      role="button"
      :tabindex="pin.id === tabStop ? 0 : -1"
      :aria-pressed="pin.id === selected"
      :aria-label="labelOf(pin)"
      aria-describedby="plan-pin-help"
      :data-pin="pin.id"
      :data-lat="pin.lat"
      :data-lon="pin.lon"
      @pointerdown.stop="grip.begin($event, 'move', pin.id)"
      @pointermove="grip.move($event)"
      @pointerup="grip.end($event)"
      @pointercancel="grip.cancel()"
      @focus="focused = pin.id"
      @click="state.select(pin.id)"
      @keydown.enter.prevent="state.select(pin.id)"
      @keydown.space.prevent="state.select(pin.id)"
      @keydown.delete.prevent="remove($event, pin.id)"
      @keydown="keyOn($event, pin)"
    >
      <circle r="14" />
      <text y="5" text-anchor="middle">{{ pin.number }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
// The plan over the map: its route in the route colour (and no other line has it), the items that have a place as numbered pins
// (the numbers the list has), the selected one marked, and a pin that has a problem marked with it (in words for a screen reader
// too). A pin selects its item with a pointer or with Enter or Space, and Delete takes it out (Undo gives it back).
// The pins are ONE tab stop (the focused one, else the selected one, else the first): the arrows, Home and End move between them,
// so a plan of a thousand items does not put a thousand stops between the map and the list; Shift and an arrow nudge the pin
// (ten pixels, with Alt one). A pin is dragged to move it, and a line of the route is dragged to put a new waypoint on it: the
// picture follows the pointer, the release is ONE edit, and Escape drops the drag. The pins are where the places say, so they
// move with the map.
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlan } from '@/composables/usePlan'
import { nudgeOf, usePlanDrag } from '@/composables/usePlanDrag'
import { type Point, type Size, type View, placeAt } from '@/lib/map/geo'

const props = defineProps<{
  /** Where a position is on the screen of the map. */
  place: (lat: number, lon: number) => Point
  /** The size of the map. */
  size: Size
  /** What the map shows (to say what place a point of the screen is). */
  view: View
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

/** Where a box that cannot be measured is taken to be. */
const ORIGIN = { left: 0, top: 0 }

/** A pin as it is drawn. */
interface Placed {
  id: number
  number: number
  lat: number
  lon: number
  at: Point
  flag: 'error' | 'warning' | null
}

const { t } = useI18n()
const state = usePlan()
const { pins, selected, problems } = state
const root = ref<SVGElement | null>(null)
/** The pin that has the focus, or had it last. */
const focused = ref<number | null>(null)

/**
 * Where a pointer event is on the map.
 *
 * @param event the pointer event
 * @returns the point from the top left of the map
 */
function pointOf(event: PointerEvent): Point {
  const box = root.value?.getBoundingClientRect() ?? ORIGIN

  return { x: event.clientX - box.left, y: event.clientY - box.top }
}

const grip = usePlanDrag({
  pointOf,
  placeAt: point => placeAt(props.view, props.size, point),
  moved: (id, at) => {
    state.select(id)
    state.placeItem(id, at.lat, at.lon, false)
  },
  inserted: (afterId, at) => state.insertAfter(afterId, at.lat, at.lon),
})

/** What is wrong with each item that has a problem: an error, or only a warning. */
const flags = computed(() => {
  const found = new Map<number, 'error' | 'warning'>()
  for (const problem of problems.value) {
    if (problem.itemId !== null && found.get(problem.itemId) !== 'error') {
      found.set(problem.itemId, problem.level)
    }
  }

  return found
})

/**
 * Where a pin is drawn: where its place is, or under the pointer while it is dragged.
 *
 * @param id the item
 * @param lat the latitude
 * @param lon the longitude
 * @returns the point on the screen
 */
function atOf(id: number, lat: number, lon: number): Point {
  const held = grip.moving.value

  return held?.id === id ? held.at : props.place(lat, lon)
}

const placed = computed<Placed[]>(() => pins.value.map(pin => ({
  ...pin,
  at: atOf(pin.id, pin.lat, pin.lon),
  flag: flags.value.get(pin.id) ?? null,
})))
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
/** The legs of the route, each the place to take hold of to put a waypoint on it (the item it leaves from names it). */
const segments = computed(() => placed.value.slice(1).map((to, index) => {
  const from = placed.value[index] as Placed

  return { id: from.id, from: from.at, to: to.at }
}))
/** The waypoint a dragged line would put in: where the pointer is, numbered as it would be. */
const ghost = computed(() => {
  const held = grip.inserting.value
  const from = placed.value.find(pin => pin.id === held?.id)

  return held && from ? { at: held.at, number: from.number + 1 } : null
})

/**
 * Where a thing is, as the transform of an SVG element.
 *
 * @param at the point
 * @returns the transform
 */
function translate(at: Point): string {
  return `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`
}

/**
 * What a pin is called to a screen reader: its item, and that it has an error or a warning.
 *
 * @param pin the pin
 * @returns the words
 */
function labelOf(pin: Placed): string {
  if (pin.flag === null) {
    return t('plan.map.pin', { number: pin.number })
  }

  return t(pin.flag === 'error' ? 'plan.map.pinError' : 'plan.map.pinWarning', { number: pin.number })
}

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
 * Whether a key is pressed with a modifier.
 *
 * @param event the key event
 * @returns true when it is
 */
function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
}

/**
 * What a key does to the position among the pins (a key with a modifier is the browser's, not the map's).
 *
 * @param event the key event
 * @returns the step, or undefined for a key that does not move
 */
function stepOf(event: KeyboardEvent): ((index: number, count: number) => number) | undefined {
  return hasModifier(event) ? undefined : STEPS[event.key]
}

/**
 * Shift and an arrow on a pin take its item a few pixels that way, as one edit (the nudges of a key held down are one).
 *
 * @param by the shift on the screen
 * @param pin the pin
 */
function nudge(by: Point, pin: Placed): void {
  const to = placeAt(props.view, props.size, { x: pin.at.x + by.x, y: pin.at.y + by.y })

  state.select(pin.id)
  state.placeItem(pin.id, to.lat, to.lon, true)
}

/**
 * A key that is the pin's: not the browser's, and not the map's (the arrows would pan it).
 *
 * @param event the key event
 */
function consume(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * Puts the focus on the pin of an item.
 *
 * @param id the item
 */
function focusPin(id: number): void {
  root.value?.querySelector<SVGElement>(`[data-pin="${id}"]`)?.focus()
}

/**
 * A key on a pin: Shift and an arrow nudge it; an arrow, Home or End move the focus to another pin (the map does not pan).
 *
 * @param event the key event
 * @param pin the pin it is on
 */
function keyOn(event: KeyboardEvent, pin: Placed): void {
  const by = nudgeOf(event)
  const step = stepOf(event)
  if (by) {
    consume(event)
    nudge(by, pin)
  } else if (step) {
    consume(event)
    focusPin(neighbour(step, pin.id))
  }
}
</script>
