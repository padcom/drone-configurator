<template>
  <div class="plan-map">
    <FlightMap :source="source" :follow-vehicle="false" :fit="fit">
      <template #default="{ place, size }">
        <MapOverlay :source="source" :place="place" :size="size" />
        <PlanOverlay :place="place" :size="size" />
      </template>
    </FlightMap>
    <p v-if="bare" class="plan-map-note">{{ t('plan.map.noPlace') }}</p>
  </div>
</template>

<script setup lang="ts">
// The map of the Plan page: the map of the Fly page (the same tiles, switches and credit, the vehicle and home when there is one)
// with the plan over it. The map is taken to the plan once: when the first places of it are given (a plan that was kept while
// another screen was shown is in view when the page is), never again, so that what the user pans to stays where it is.
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlightMap from '@/components/map/FlightMap.vue'
import MapOverlay from '@/components/map/MapOverlay.vue'
import PlanOverlay from '@/components/plan/PlanOverlay.vue'
import { useLiveMapSource } from '@/composables/useLiveMapSource'
import { usePlan } from '@/composables/usePlan'
import type { LatLon } from '@/lib/map/track'

const source = useLiveMapSource()
const { t } = useI18n()
const { pins, plan } = usePlan()
/** Whether the plan has items and none of them has a place: the map is bare, and says why (an empty plan says it in the list). */
const bare = computed(() => plan.value.items.length > 0 && pins.value.length === 0)
/** The places the map is fitted to: those the plan has when it first has any (undefined until then). */
const fit = shallowRef<LatLon[] | undefined>()

watch(pins, places => {
  if (fit.value === undefined && places.length > 0) {
    fit.value = places.map(({ lat, lon }) => ({ lat, lon }))
  }
}, { immediate: true })
</script>
