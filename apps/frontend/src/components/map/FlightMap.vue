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
    <div v-if="source" class="map-follow" role="group" :aria-label="t('map.vehicle.group')">
      <button
        id="map-follow"
        type="button"
        class="map-button"
        :aria-pressed="following"
        :disabled="!mark"
        :title="t('map.vehicle.follow')"
        :aria-label="t('map.vehicle.follow')"
        @click="follow"
      >
        ◎
      </button>
      <button
        id="map-centre"
        type="button"
        class="map-button"
        :disabled="!mark"
        :title="t('map.vehicle.centre')"
        :aria-label="t('map.vehicle.centre')"
        @click="centre"
      >
        ⌖
      </button>
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
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '@/composables/useConfigurator'
import { MAX_ZOOM, MIN_ZOOM, useFlightMap } from '@/composables/useFlightMap'
import { type Point, fitView, placeAt, screenOf } from '@/lib/map/geo'
import type { MapSource } from '@/lib/map/mapSource'
import { chipOf, creditOf } from '@/lib/map/mapText'
import type { LatLon } from '@/lib/map/track'

const props = withDefaults(defineProps<{
  /** What goes over the map (the vehicle, its path, home); the buttons that follow the vehicle are there when there is one. */
  source?: MapSource
  /** Whether the map keeps the vehicle in the middle at first (a replay shows the whole path; the user may follow). */
  followVehicle?: boolean
  /** Places the map shows all of (a recorded flight's path) when they are given or change, once the map has a size. */
  fit?: readonly LatLon[]
  /** Whether a click on the map (a press and a release in the same place: not a drag) picks the place under it. */
  pickable?: boolean
}>(), { source: undefined, followVehicle: true, fit: undefined, pickable: false })

const emit = defineEmits<{
  /** The user clicked the map (only when `pickable`): the place under the pointer. */
  pick: [place: LatLon]
}>()

/** How far (px) a pointer may move between the press and the release for it to be a click, not a drag. */
const CLICK_PX = 4

/** The zoom the map goes to when it first shows the vehicle, and when it is centred on it from further out. */
const VEHICLE_ZOOM = 16

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

  return chipOf({
    enabled: enabled.value,
    offline: offline.value,
    status: status.value,
    problems: flight.problems(),
    someDrawn: flight.someDrawn(),
  }, t)
})

const mark = computed(() => props.source?.vehicle.value ?? null)
/**
 * Whether the map keeps the vehicle in the middle when it begins.
 *
 * @returns what the map was told
 */
function followsAtFirst(): boolean {
  return props.followVehicle
}

/** Where the pointer went down on the map (null while none is down). */
let pressed: Point | null = null

/** Whether the map keeps the vehicle in the middle (on until the map is dragged). */
const following = ref(followsAtFirst())
/** Whether the map has been taken to the vehicle once (then it only follows: it does not zoom again). */
let shown = false

watch(mark, here => {
  if (here && following.value) {
    flight.centerOn(here, shown ? undefined : Math.max(view.value.zoom, VEHICLE_ZOOM))
    shown = true
  }
}, { immediate: true })

/** The places the map was last fitted to (a new list is a new flight, and the map shows all of it). */
let fittedTo: readonly LatLon[] | undefined

/**
 * Shows all of some places.
 *
 * @param places the places
 */
function fitTo(places: readonly LatLon[]): void {
  const next = fitView(places, size.value)
  if (next) {
    fittedTo = places
    flight.view.value = next
    shown = true
  }
}

/** Shows all of the places that were given, once the map is laid out (before that it has no size to fit them to). */
function fitNow(): void {
  const places = props.fit
  if (places && size.value.width > 0 && fittedTo !== places) {
    fitTo(places)
  }
}

// The whole of a recorded flight is in view when it is given.
watch([() => props.fit, () => size.value.width], fitNow, { immediate: true })

/** Puts the vehicle in the middle, close enough to see it. */
function centreNow(): void {
  if (mark.value && following.value) {
    flight.centerOn(mark.value, Math.max(view.value.zoom, VEHICLE_ZOOM))
  }
}

/** The follow button: the map keeps the vehicle in the middle again. */
function follow(): void {
  following.value = !following.value
  centreNow()
}

/** The centre button: the vehicle in the middle now (and the map follows it again). */
function centre(): void {
  following.value = true
  centreNow()
}

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
    pressed = at(event)
    following.value = false
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
 * Whether a release is a click: the pointer is where it went down, within a few pixels.
 *
 * @param here where it was released
 * @param was where it went down
 * @returns true when it is
 */
function isClick(here: Point, was: Point | null): boolean {
  return was !== null && Math.hypot(here.x - was.x, here.y - was.y) <= CLICK_PX
}

/**
 * A press and a release in the same place pick the place under them (a drag does not, nor a pointer that was taken away).
 *
 * @param event the pointer event of the release
 * @param was where the pointer went down
 */
function picks(event: PointerEvent, was: Point | null): void {
  const here = at(event)
  if (props.pickable && event.type === 'pointerup' && isClick(here, was)) {
    emit('pick', placeAt(view.value, size.value, here))
  }
}

/**
 * The pointer went up (or was taken away): the drag ends.
 *
 * @param event the pointer event
 */
function up(event: PointerEvent): void {
  const was = pressed
  pressed = null

  if (flight.release(event.pointerId)) {
    root.value?.releasePointerCapture?.(event.pointerId)
    picks(event, was)
  }
}

/**
 * The wheel turned: one zoom, about the pointer.
 *
 * @param event the wheel event
 */
function wheel(event: WheelEvent): void {
  // (a zoom about the pointer moves the middle of the map: the map is the user's now, as after a drag)
  following.value = false
  flight.wheel(event.deltaY < 0 ? 1 : -1, at(event))
}

/**
 * Whether a key is pressed with a modifier (the browser's and the system's shortcuts are not the map's).
 *
 * @param event the key event
 * @returns true when it is
 */
function modified(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

/**
 * A key: the arrows move the map, + and - zoom it (the other keys are left alone: Tab goes on).
 *
 * @param event the key event
 */
function key(event: KeyboardEvent): void {
  if (flight.key(event.key, modified(event))) {
    // (the arrows move the map off the vehicle: the user has taken it; + and - zoom about the middle, where the vehicle is)
    following.value = following.value && !event.key.startsWith('Arrow')
    event.preventDefault()
  }
}

/**
 * Whether a point is on the map (the very edge counts: where a pin was just dropped is in view).
 *
 * @param point the point from the top left of the map
 * @returns true when it is
 */
function onMap(point: Point): boolean {
  const { width, height } = size.value

  return point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height
}

/**
 * Brings a place into view when it is not (outside the map): the map is centred on it, at the zoom it has, and is the user's now.
 * A place in view does not move the map.
 *
 * @param lat the latitude
 * @param lon the longitude
 */
function reveal(lat: number, lon: number): void {
  if (size.value.width > 0 && !onMap(place(lat, lon))) {
    following.value = false
    flight.centerOn({ lat, lon })
  }
}

defineExpose({ reveal })

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
