<template>
  <div
    ref="root"
    class="map"
    role="application"
    tabindex="0"
    :aria-label="t('map.label')"
    :aria-describedby="`${uid}-help`"
    :data-lat="view.lat.toFixed(5)"
    :data-lon="view.lon.toFixed(5)"
    :data-zoom="view.zoom"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @wheel.prevent="wheel"
    @keydown="key"
  >
    <canvas ref="canvas" class="map-canvas" aria-hidden="true" />
    <!-- What is drawn over the map (markers, the trail) is placed by the slot's `place`, from a latitude and a longitude. -->
    <div class="map-overlay">
      <slot :place="place" :view="view" :size="size" />
    </div>
    <div class="map-zoom" role="group" :aria-label="t('map.zoom')">
      <button
        id="map-zoom-in"
        type="button"
        class="map-button"
        :disabled="atMost"
        :aria-label="t('map.zoomIn')"
        @click="zoom(1)"
      >
        +
      </button>
      <button
        id="map-zoom-out"
        type="button"
        class="map-button"
        :disabled="atLeast"
        :aria-label="t('map.zoomOut')"
        @click="zoom(-1)"
      >
        −
      </button>
    </div>
    <!-- Always there, empty when the tiles are fine: a live region is announced when its text changes, not when inserted. -->
    <p id="map-chip" class="map-chip" role="status">{{ chip }}</p>
    <!-- The credit is part of the map, always there: a link that the system browser opens when it is clicked. -->
    <p v-if="credit.text" class="map-attribution">
      <a id="map-attribution" :href="credit.url" target="_blank" rel="noopener noreferrer">{{ credit.text }}</a>
    </p>
    <p :id="`${uid}-help`" class="visually-hidden">{{ t('map.help') }}</p>
  </div>
</template>

<script setup lang="ts">
// The map: raster tiles of the source the settings choose, drawn on a canvas, with pan (drag, arrow keys), zoom (wheel, + and -,
// the buttons), the credit of the source as a link on the map itself, and a line that says why there are holes (the tiles are
// switched off, offline, the server is not answering). The tiles come from the backend (the page cannot reach a tile server,
// and must not tell one where the vehicle is), which also keeps the switches of the settings; the map only asks for what is on
// screen. What goes over the map (the vehicle, its trail) is the slot's, placed from a latitude and a longitude.
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '@/composables/useConfigurator'
import { MAX_ZOOM, MIN_ZOOM, useFlightMap } from '@/composables/useFlightMap'
import { type Point, screenOf } from '@/lib/map/geo'
import { chipOf, creditOf } from '@/lib/map/mapText'

const { t } = useI18n()
const uid = useId()
const { map } = useConfigurator()
const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const flight = useFlightMap(canvas)
const { view, size } = flight
/** Where a box that cannot be measured is taken to be. */
const ORIGIN = { left: 0, top: 0 }
const atMost = computed(() => view.value.zoom >= MAX_ZOOM)
const atLeast = computed(() => view.value.zoom <= MIN_ZOOM)
const credit = computed(() => creditOf(map.info.value, map.source.value))
const chip = computed(() => {
  // (the count of changes makes the line follow the tiles that failed)
  void flight.changes.value

  const { enabled, offline, status } = map

  return chipOf({ enabled: enabled.value, offline: offline.value, status: status.value, problems: flight.problems() }, t)
})

/**
 * Zooms by whole steps about the middle of the map.
 *
 * @param steps how many zooms (1 in, -1 out)
 */
function zoom(steps: number): void {
  flight.zoom(steps)
}

/**
 * Where a position is on the screen of the map.
 *
 * @param lat the latitude
 * @param lon the longitude
 * @returns the point from the top left of the map
 */
function place(lat: number, lon: number): Point {
  return screenOf(view.value, size.value, lat, lon)
}

/**
 * Where a pointer or a wheel event is on the map.
 *
 * @param event the event
 * @returns the point from the top left of the map
 */
function at(event: MouseEvent): Point {
  const { left, top } = root.value?.getBoundingClientRect() ?? ORIGIN

  return { x: event.clientX - left, y: event.clientY - top }
}

/**
 * Whether an event began on a control of the map (a button, the credit's link): those are pressed, not dragged.
 *
 * @param event the event
 * @returns true when it did
 */
function onControl(event: Event): boolean {
  return (event.target as HTMLElement).closest('a, button') !== null
}

/**
 * Whether a pointer that went down begins a drag: the main button, the first pointer, and not on a control.
 *
 * @param event the pointer event
 * @returns true when it does
 */
function startsDrag(event: PointerEvent): boolean {
  return event.isPrimary && event.button === 0 && !onControl(event)
}

/**
 * The pointer went down on the map (not on a button or the credit): a drag begins.
 *
 * @param event the pointer event
 */
function down(event: PointerEvent): void {
  if (startsDrag(event)) {
    flight.press(event.pointerId, at(event))
    root.value?.setPointerCapture?.(event.pointerId)
  }
}

/**
 * The pointer moved: the map follows it while it is held down.
 *
 * @param event the pointer event
 */
function move(event: PointerEvent): void {
  flight.dragTo(event.pointerId, at(event))
}

/**
 * The pointer went up (or was taken away): the drag ends.
 *
 * @param event the pointer event
 */
function up(event: PointerEvent): void {
  if (flight.release(event.pointerId)) {
    root.value?.releasePointerCapture?.(event.pointerId)
  }
}

/**
 * The wheel turned: one zoom, about the pointer.
 *
 * @param event the wheel event
 */
function wheel(event: WheelEvent): void {
  flight.wheel(event.deltaY < 0 ? 1 : -1, at(event))
}

/**
 * A key: the arrows move the map, + and - zoom it (the other keys are left alone: Tab goes on).
 *
 * @param event the key event
 */
function key(event: KeyboardEvent): void {
  if (flight.key(event.key, event.ctrlKey || event.metaKey || event.altKey)) {
    event.preventDefault()
  }
}

/** Takes the size of the box the map is in. */
function measure(): void {
  const box = root.value
  if (box) {
    flight.resize(box.clientWidth, box.clientHeight)
  }
}

/** Follows the size of the box (a window without observers is measured once). */
const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)

onMounted(() => {
  measure()

  if (root.value) {
    observer?.observe(root.value)
  }

  void map.refresh()
})

onBeforeUnmount(() => observer?.disconnect())
</script>
