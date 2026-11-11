<template>
  <header id="top-bar" class="top-bar" data-l="topbar">
    <h1 class="visually-hidden">{{ t('app.title') }}</h1>
    <ConnectionAnnouncement />
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
    <button
      id="open-connect"
      type="button"
      aria-haspopup="dialog"
      class="vehicle"
      :class="vehicle.tone"
      :title="t('connect.open')"
      @click="connectDialog.show()"
    >
      <span class="dot" aria-hidden="true" />
      <span class="lines">
        <span class="title">{{ vehicle.title }}</span>
        <span class="sub">{{ vehicle.sub }}</span>
      </span>
      <Icon name="chevron-down" />
    </button>
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
      <button
        id="open-palette"
        type="button"
        class="palette-button"
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+P"
        @click="palette.show()"
      >
        <Icon name="search" />
        <span class="palette-button-text">{{ t('palette.placeholder') }}</span>
        <kbd class="palette-button-key">{{ hint }}</kbd>
      </button>
      <Button id="disconnect-button" :disabled="!canDisconnect" @click="configurator.vehicle.disconnect()">
        {{ t('connection.disconnect') }}
      </Button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ConnectionAnnouncement from './ConnectionAnnouncement.vue'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { HOME } from '@/screens/registry'
import { cellsFor, vehicleCellFor } from '@/lib/fly/topBar'
import { useConfigurator } from '@/composables/useConfigurator'
import { useConnectDialog } from '@/composables/useConnectDialog'
import { useCommandPalette } from '@/composables/useCommandPalette'
import { hintOf } from '@/lib/app/keymap'
import { useFormat } from '@/i18n/useFormat'
import { useTelemetry } from '@/composables/useTelemetry'

// The top bar: the logo (home), the vehicle and the link, the five live cells MODE / STATE / BATTERY / GPS / LINK, and
// Disconnect. The cells show a vehicle only while the link is up (the last telemetry of a link that is gone is not what the
// vehicle is doing), and an armed vehicle fills its STATE cell amber, with the word ARMED too.
const { t } = useI18n()
const configurator = useConfigurator()
const connectDialog = useConnectDialog()
const palette = useCommandPalette()
// "Ctrl P", or "⌘ P" on a Mac.
const hint = hintOf('palette.open')
const format = useFormat()
const telemetry = useTelemetry()
const state = computed(() => configurator.fields.connection.value.state)
// Disconnect also ends the tries to bring a lost link back (the backend stops them: the session ends), so it is offered
// while they go on too.
const canDisconnect = computed(() => state.value === 'connected' || state.value === 'reconnecting')
const vehicle = computed(() => vehicleCellFor(configurator.fields.connection.value, t))
const cells = computed(() => cellsFor(state.value === 'connected' ? telemetry.value : null, t, format))
</script>
