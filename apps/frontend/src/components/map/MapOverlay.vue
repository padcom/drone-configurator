<template>
  <svg class="map-svg" :width="size.width" :height="size.height" :viewBox="`0 0 ${size.width} ${size.height}`">
    <defs>
      <!-- An old position is hatched: the colour only adds to it (the label and the words say it). -->
      <pattern :id="`${uid}-old`" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" class="map-hatch-ground" />
        <line x1="0" y1="0" x2="0" y2="6" class="map-hatch-line" />
      </pattern>
    </defs>
    <polyline v-if="path" class="map-trail" :points="path" fill="none" aria-hidden="true" />
    <g
      v-if="homeAt"
      class="map-home"
      :transform="`translate(${homeAt.x} ${homeAt.y})`"
      role="img"
      :aria-label="homeLabel"
      :data-lat="source.home.value?.lat"
      :data-lon="source.home.value?.lon"
    >
      <circle r="11" />
      <text y="4" text-anchor="middle">{{ HOME_LETTER }}</text>
    </g>
    <g
      v-if="vehicleAt && mark"
      class="map-vehicle"
      :class="{ stale: mark.stale }"
      :transform="`translate(${vehicleAt.x} ${vehicleAt.y})`"
      role="img"
      :aria-label="vehicleWords"
      :data-lat="mark.lat"
      :data-lon="mark.lon"
      :data-heading="mark.heading"
      :data-height="mark.height"
      :data-stale="mark.stale"
    >
      <g :transform="`rotate(${mark.heading ?? 0})`">
        <path v-if="mark.heading !== undefined" d="M0 -14 L9 11 L0 6 L-9 11 Z" :fill="fill" />
        <circle v-else r="8" :fill="fill" />
      </g>
      <text v-if="mark.stale" class="map-stale-label" y="28" text-anchor="middle">{{ lastHeard }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
// What goes over the map: the path flown, home (a green H) and the vehicle (an arrow that points the way it heads, a dot when it
// does not say). The vehicle is hatched and says how long ago it was heard when its position is old, and is not there without a
// position. The markers say where they are in words for a screen reader (`aria-label`) and in `data-lat` and `data-lon` (what the
// window tests read). It draws from a map source, so a recorded flight draws the same way.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Point, Size } from '@/lib/map/geo'
import type { MapSource } from '@/lib/map/mapSource'
import { lastHeardText, vehicleLabel } from '@/lib/map/mapText'

const props = defineProps<{
  /** What to draw. */
  source: MapSource
  /** Where a position is on the screen of the map. */
  place: (lat: number, lon: number) => Point
  /** The size of the map. */
  size: Size
}>()

/** What home is marked with (the letter is a symbol, as on the maps of flight: not a word of the interface). */
const HOME_LETTER = 'H'

const { t } = useI18n()
const uid = useId()
const mark = computed(() => props.source.vehicle.value)
const vehicleAt = computed(() => (mark.value ? props.place(mark.value.lat, mark.value.lon) : null))
const homeAt = computed(() => {
  const home = props.source.home.value

  return home ? props.place(home.lat, home.lon) : null
})
const path = computed(() => {
  const points = props.source.trail.value.map(point => props.place(point.lat, point.lon))

  return points.length < 2 ? '' : points.map(at => `${at.x.toFixed(1)},${at.y.toFixed(1)}`).join(' ')
})
/** The fill of the marker: the hatching when its position is old. */
const fill = computed(() => (mark.value?.stale ? `url(#${uid}-old)` : undefined))
const lastHeard = computed(() => (mark.value ? lastHeardText(mark.value, t) : ''))
const vehicleWords = computed(() => (mark.value ? vehicleLabel(mark.value, t) : ''))
const homeLabel = computed(() => {
  const home = props.source.home.value

  return home ? t('map.home.label', { lat: home.lat.toFixed(5), lon: home.lon.toFixed(5) }) : ''
})
</script>
