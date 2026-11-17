<template>
  <svg class="map-svg" :width="size.width" :height="size.height" :viewBox="`0 0 ${size.width} ${size.height}`">
    <polyline v-if="line" :points="line" class="plan-route" aria-hidden="true" />
    <g
      v-for="pin in placed"
      :key="pin.id"
      class="plan-pin"
      :class="{ selected: pin.id === selected }"
      :transform="`translate(${pin.at.x.toFixed(1)} ${pin.at.y.toFixed(1)})`"
      role="button"
      tabindex="0"
      :aria-pressed="pin.id === selected"
      :aria-label="t('plan.map.pin', { number: pin.number })"
      :data-lat="pin.lat"
      :data-lon="pin.lon"
      @pointerdown.stop
      @click="state.select(pin.id)"
      @keydown.enter.prevent="state.select(pin.id)"
      @keydown.space.prevent="state.select(pin.id)"
    >
      <circle r="14" />
      <text y="5" text-anchor="middle">{{ pin.number }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
// The plan over the map: its route in the route colour (and no other line has it), the items that have a place as numbered pins
// (the numbers the list has), the selected one marked. A pin selects its item, with a pointer or with Enter or Space. The pins
// are where the places say, so they move with the map; nothing here changes the plan (the editing comes next).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlan } from '@/composables/usePlan'
import type { Point, Size } from '@/lib/map/geo'

const props = defineProps<{
  /** Where a position is on the screen of the map. */
  place: (lat: number, lon: number) => Point
  /** The size of the map. */
  size: Size
}>()

const { t } = useI18n()
const state = usePlan()
const { pins, selected } = state
const placed = computed(() => pins.value.map(pin => ({ ...pin, at: props.place(pin.lat, pin.lon) })))
/** The route as the points of an SVG polyline: nothing for fewer than two places. */
const line = computed(() => {
  const points = placed.value.map(pin => `${pin.at.x.toFixed(1)},${pin.at.y.toFixed(1)}`)

  return points.length < 2 ? '' : points.join(' ')
})
</script>
