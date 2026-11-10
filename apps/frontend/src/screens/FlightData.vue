<template>
  <div class="fly" data-l="fly">
    <section class="fly-main" :aria-label="t('flight.map.title')">
      <div class="fly-map">
        <p class="muted placeholder">{{ t('flight.map.placeholder') }}</p>
      </div>
    </section>
    <aside class="fly-aside" tabindex="-1" :aria-label="t('flight.aside')">
      <p class="muted placeholder">{{ t('flight.hud.placeholder') }}</p>
      <section id="telemetry" class="cards">
        <TelemetryCards />
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TelemetryCards from '../TelemetryCards.vue'

// The screen the user lives in, in fixed regions (the design's Fly): at the left the map (a placeholder until it is built;
// the view tabs above it and the control strip below it are drawn when there is more than one view and the commands exist),
// and the aside at the right, which scrolls on its own, with the heads-up display (not built yet) and the telemetry
// cards. F6 moves the focus between the rail, the screen and the aside (paneFocus.ts, started by the shell).
const { t } = useI18n()
</script>
