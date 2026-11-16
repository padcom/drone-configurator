<template>
  <div class="fly" data-l="fly">
    <section class="fly-main" :aria-label="t('flight.map.title')">
      <FlightStrip v-if="connected" />
      <div class="fly-map">
        <FlightMap :source="source" pickable @pick="pick">
          <template #default="{ place, size }">
            <MapOverlay :source="source" :place="place" :size="size" />
            <GoHereMarker :place="place" :size="size" />
          </template>
        </FlightMap>
        <FailsafeBanner />
        <GoHerePanel />
      </div>
    </section>
    <aside class="fly-aside" tabindex="-1" :aria-label="t('flight.aside')">
      <FlyAside />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FailsafeBanner from '@/components/fly/FailsafeBanner.vue'
import FlightStrip from '@/components/fly/FlightStrip.vue'
import GoHereMarker from '@/components/fly/GoHereMarker.vue'
import GoHerePanel from '@/components/fly/GoHerePanel.vue'
import FlyAside from '@/components/fly/FlyAside.vue'
import FlightMap from '@/components/map/FlightMap.vue'
import MapOverlay from '@/components/map/MapOverlay.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useGoHere } from '@/composables/useGoHere'
import { useLiveMapSource } from '@/composables/useLiveMapSource'

// The screen the user lives in, in fixed regions (the design's Fly): at the left the map (tiles, pan and zoom, the credit of the
// source, the vehicle with its path and home over it; the view tabs and the control strip of the flight above it are drawn
// when there is more than one view and the commands exist), and the aside at the right, which scrolls on its own, with
// the heads-up display and the telemetry cards. F6 moves the focus between the rail, the screen and the aside (paneFocus.ts,
// started by the shell). Nothing here scrolls but the aside: the map is a fixed area that is panned.
const { t } = useI18n()
// The controls of the flight are drawn while a vehicle is connected.
const { fields } = useConfigurator()
const connected = computed(() => fields.connection.value.state === 'connected')
// What the map draws over its tiles: the connected vehicle, its path and home (the screen is kept alive, so the path goes
// on while another screen is shown).
const source = useLiveMapSource()
// A click on the map picks the place a Go here would fly to (it is only sent when the user asks, and confirms as Settings say).
const { pick } = useGoHere()
</script>
