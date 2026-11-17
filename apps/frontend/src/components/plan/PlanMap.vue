<template>
  <div class="plan-map" :class="{ adding }">
    <FlightMap ref="map" :source="source" :follow-vehicle="false" :fit="fit" :pickable="adding" @pick="picked">
      <template #default="{ place, size, view }">
        <MapOverlay :source="source" :place="place" :size="size" />
        <PlanOverlay :place="place" :size="size" :view="view" />
      </template>
    </FlightMap>
    <div class="plan-map-bar">
      <p v-if="bare" class="plan-map-note">{{ t('plan.map.noPlace') }}</p>
      <button
        id="plan-add-on-map"
        type="button"
        class="plan-map-add"
        :aria-pressed="adding"
        :disabled="full && !adding"
        aria-describedby="plan-add-help"
        :title="t('plan.map.addHelp')"
        @click="setAdding(!adding)"
      >
        {{ t('plan.map.add') }}
      </button>
      <!-- What the button does, and why it is off when it is: the words of the palette's reason for a full plan. -->
      <p id="plan-add-help" class="visually-hidden">{{ full ? t('plan.reason.planFull') : t('plan.map.addHelp') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// The map of the Plan page: the map of the Fly page (the same tiles, switches and credit, the vehicle and home when there is one)
// with the plan over it. The map is taken to the plan once: when the first places of it are given (a plan that was kept while
// another screen was shown is in view when the page is), never again, so that what the user pans to stays where it is.
// "Add waypoints" is a mode of the map (not of the plan: it is not taken back): while it is on, a click on the map (not a drag)
// adds a waypoint there, after the selected item, and Escape (anywhere on the page: the page says so) leaves it. Without a
// pointer the way to add one is the list's button and the latitude and longitude fields, which the button's help says.
import { computed, onBeforeUnmount, onDeactivated, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FlightMap from '@/components/map/FlightMap.vue'
import MapOverlay from '@/components/map/MapOverlay.vue'
import PlanOverlay from '@/components/plan/PlanOverlay.vue'
import { useLiveMapSource } from '@/composables/useLiveMapSource'
import { usePlan } from '@/composables/usePlan'
import type { LatLon } from '@/lib/map/track'

const source = useLiveMapSource()
const { t } = useI18n()
const { pins, plan, selected, adding, full, addAt, setAdding } = usePlan()
const map = ref<InstanceType<typeof FlightMap> | null>(null)
/** Whether the plan has items and none has a place: the map is bare and says why (an empty plan says it in the list). */
const bare = computed(() => plan.value.items.length > 0 && pins.value.length === 0)
/** The places the map is fitted to: those the plan has when it first has any (undefined until then). */
const fit = shallowRef<LatLon[] | undefined>()

watch(pins, places => {
  if (fit.value === undefined && places.length > 0) {
    fit.value = places.map(({ lat, lon }) => ({ lat, lon }))
  }
}, { immediate: true })

// Selecting an item (in the list, from a problem of the validity header, by Undo) shows it when it is off the map or at its edge:
// the map goes to it at the zoom it has. An item that is in view, and every edit (a drag, a nudge, an added waypoint), leave the
// map where it is.
watch(selected, id => {
  const pin = pins.value.find(candidate => candidate.id === id)
  if (pin) {
    map.value?.reveal(pin.lat, pin.lon)
  }
})

/**
 * A click on the map in the adding mode: a waypoint there (the map stays where the user has it: it is not fitted to it).
 *
 * @param at the place
 */
function picked(at: LatLon): void {
  fit.value ??= []
  addAt(at.lat, at.lon)
}

// The mode is for as long as the page is shown: coming back to the page does not find it still on.
onBeforeUnmount(() => setAdding(false))
onDeactivated(() => setAdding(false))
</script>
