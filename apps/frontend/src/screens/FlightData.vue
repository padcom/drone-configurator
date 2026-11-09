<template>
  <div class="flight-data">
    <SplitPane v-model="layout.main.value" :label="t('flight.resize.main')" :min="MIN" :max="MAX">
      <template #first>
        <FlightPane :title="t('flight.map.title')" :collapsed="layout.isCollapsed('map')" @toggle="layout.toggle('map')">
          <p class="muted placeholder">{{ t('flight.map.placeholder') }}</p>
        </FlightPane>
      </template>
      <template #second>
        <SplitPane v-model="layout.side.value" direction="column" :label="t('flight.resize.side')" :min="MIN" :max="MAX">
          <template #first>
            <FlightPane :title="t('flight.hud.title')" :collapsed="layout.isCollapsed('hud')" @toggle="layout.toggle('hud')">
              <p class="muted placeholder">{{ t('flight.hud.placeholder') }}</p>
            </FlightPane>
          </template>
          <template #second>
            <FlightPane
              :title="t('flight.detail.title')"
              :collapsed="layout.isCollapsed('detail')"
              @toggle="layout.toggle('detail')"
            >
              <Tabs v-model="layout.tab.value" :label="t('flight.detail.tabs')" :tabs="tabs">
                <template #telemetry>
                  <section id="telemetry" class="cards">
                    <TelemetryCards />
                  </section>
                </template>
              </Tabs>
            </FlightPane>
          </template>
        </SplitPane>
      </template>
    </SplitPane>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FlightPane from '../FlightPane.vue'
import { MAX, MIN, useFlightLayout } from '../flightLayout'
import SplitPane from '../kit/SplitPane.vue'
import Tabs from '../kit/Tabs.vue'
import TelemetryCards from '../TelemetryCards.vue'

// The screen the user lives in: a map pane (not built yet), a heads-up display pane (not built yet), and a pane of
// details, whose first tab is the telemetry cards. Each pane can be resized with its bar (by pointer or by keyboard) and
// collapsed to its header, and opened again.
const { t } = useI18n()
const layout = useFlightLayout()
const tabs = computed(() => [{ id: 'telemetry', label: t('flight.detail.telemetry') }])
</script>
