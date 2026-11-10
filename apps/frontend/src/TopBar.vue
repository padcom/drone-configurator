<template>
  <header id="top-bar" class="top-bar" data-l="topbar">
    <h1 class="visually-hidden">{{ t('app.title') }}</h1>
    <RouterLink :to="HOME" class="logo" :aria-label="t('topBar.home')">
      <svg
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <circle cx="5.5" cy="5.5" r="3" />
        <circle cx="18.5" cy="5.5" r="3" />
        <circle cx="5.5" cy="18.5" r="3" />
        <circle cx="18.5" cy="18.5" r="3" />
        <path d="m8 8 8 8M16 8l-8 8" />
      </svg>
    </RouterLink>
    <div class="vehicle" :class="vehicle.tone">
      <span class="dot" aria-hidden="true" />
      <span class="lines">
        <span class="title">{{ vehicle.title }}</span>
        <span class="sub">{{ vehicle.sub }}</span>
      </span>
    </div>
    <dl class="cells">
      <div v-for="cell in cells" :key="cell.id" class="cell" :class="[cell.id, { armed: cell.armed }]">
        <dt>{{ cell.label }}</dt>
        <dd>
          <template v-if="cell.missing">
            <span aria-hidden="true">{{ cell.value }}</span>
            <span class="visually-hidden">{{ t('truth.notReported') }}</span>
          </template>
          <template v-else>{{ cell.value }}</template>
        </dd>
      </div>
    </dl>
    <div class="actions">
      <Button id="topbar-disconnect" :disabled="!canDisconnect" @click="configurator.vehicle.disconnect()">
        {{ t('connection.disconnect') }}
      </Button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import { HOME } from './screens'
import { cellsFor, vehicleCellFor } from './topBar'
import { useConfigurator } from './useConfigurator'
import { useFormat } from './useFormat'
import { useTelemetry } from './useTelemetry'

// The top bar: the logo (home), the vehicle and the link, the five live cells MODE / STATE / BATTERY / GPS / LINK, and
// Disconnect. The cells show a vehicle only while the link is up (the last telemetry of a link that is gone is not what the
// vehicle is doing), and an armed vehicle fills its STATE cell amber, with the word ARMED too.
const { t } = useI18n()
const configurator = useConfigurator()
const format = useFormat()
const telemetry = useTelemetry()
const state = computed(() => configurator.fields.connection.value.state)
// Disconnect also ends the tries to bring a lost link back (the backend stops them: the session ends), so it is offered
// while they go on too.
const canDisconnect = computed(() => state.value === 'connected' || state.value === 'reconnecting')
const vehicle = computed(() => vehicleCellFor(configurator.fields.connection.value, t))
const cells = computed(() => cellsFor(state.value === 'connected' ? telemetry.value : null, t, format))
</script>
