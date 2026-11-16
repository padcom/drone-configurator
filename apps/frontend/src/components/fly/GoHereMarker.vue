<template>
  <svg v-if="at" class="map-svg" :width="size.width" :height="size.height" :viewBox="`0 0 ${size.width} ${size.height}`">
    <g
      class="map-target"
      :transform="`translate(${at.x} ${at.y})`"
      role="img"
      :aria-label="label"
      :data-lat="target?.lat"
      :data-lon="target?.lon"
    >
      <circle r="11" />
      <circle r="3" class="map-target-dot" />
    </g>
  </svg>
</template>

<script setup lang="ts">
// The place picked on the map for a Go here: a ring with a dot, over the tiles. It says where it is in words for a screen
// reader and in
// `data-lat` and `data-lon` (what the window tests read). It is not there when no place is picked.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useGoHere } from '@/composables/useGoHere'
import type { Place } from '@/lib/fly/guided'
import type { Point, Size } from '@/lib/map/geo'

const props = defineProps<{
  /** Where a position is on the map's screen. */
  place: (lat: number, lon: number) => Point
  /** The size of the map's screen. */
  size: Size
}>()

const { t } = useI18n()
const { target } = useGoHere()
const at = computed(() => (target.value ? props.place(target.value.lat, target.value.lon) : null))
/**
 * The words that say where the picked place is.
 *
 * @param place the picked place, or none
 * @returns the latitude and the longitude, as text
 */
function placeWords(place: Place | null): { lat: string, lon: string } {
  return place === null ? { lat: '', lon: '' } : { lat: place.lat.toFixed(5), lon: place.lon.toFixed(5) }
}

const label = computed(() => t('guided.panel.place', placeWords(target.value)))
</script>
