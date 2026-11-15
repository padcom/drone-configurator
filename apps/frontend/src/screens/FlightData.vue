<template>
  <div class="fly" data-l="fly">
    <section class="fly-main" :aria-label="t('flight.map.title')">
      <div class="fly-map">
        <FlightMap />
        <FailsafeBanner />
      </div>
    </section>
    <aside class="fly-aside" tabindex="-1" :aria-label="t('flight.aside')">
      <FlyAside />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import FailsafeBanner from '@/components/fly/FailsafeBanner.vue'
import FlyAside from '@/components/fly/FlyAside.vue'
import FlightMap from '@/components/map/FlightMap.vue'

// The screen the user lives in, in fixed regions (the design's Fly): at the left the map (tiles, pan and zoom, the credit of the
// source; the vehicle, its trail and home come with the next part; the view tabs above it and the control strip below it are
// drawn when there is more than one view and the commands exist), and the aside at the right, which scrolls on its own, with
// the heads-up display and the telemetry cards. F6 moves the focus between the rail, the screen and the aside (paneFocus.ts,
// started by the shell). Nothing here scrolls but the aside: the map is a fixed area that is panned.
const { t } = useI18n()
</script>
