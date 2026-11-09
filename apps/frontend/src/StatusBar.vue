<template>
  <footer id="status-bar" :aria-label="t('statusBar.label')">
    <span class="item"><span class="label">{{ t('statusBar.connection') }}</span>
      <span class="badge" :class="state">{{ t(`connection.state.${state}`) }}</span></span>
    <span class="item"><span class="label">{{ t('statusBar.vehicle') }}</span> {{ vehicleText }}</span>
    <span class="item"><span class="label">{{ t('statusBar.mode') }}</span> {{ modeText }}</span>
    <span class="item" :class="{ warn: armed }"><span class="label">{{ t('statusBar.armed') }}</span> {{ armedText }}</span>
    <span class="item"><span class="label">{{ t('statusBar.link') }}</span> {{ t('telemetry.missing') }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isStale } from './telemetryCards'
import { useConfigurator } from './useConfigurator'
import { useTelemetry } from './useTelemetry'

// What is true of the vehicle right now, in one line at the bottom of every screen. Like everywhere, what the vehicle
// has not reported is a dash, never a made-up value: the mode and the armed state show only while the link is up and
// a heartbeat has come, and a heartbeat that has gone quiet is said so.
const { t } = useI18n()
const { fields } = useConfigurator()
const telemetry = useTelemetry()
const state = computed(() => fields.connection.value.state)
const missing = computed(() => t('telemetry.missing'))
// Only while connected: the last telemetry of a link that is gone is not what the vehicle is doing.
const live = computed(() => state.value === 'connected' ? telemetry.value : null)

const vehicleText = computed(() => {
  const info = fields.connection.value.vehicle

  return info ? t('statusBar.vehicleValue', { ...info }) : missing.value
})

/**
 * Appends how old the heartbeat is, once it is stale.
 *
 * @param text what the item says
 * @returns the text, with its age when the heartbeat has gone quiet
 */
function withAge(text: string): string {
  const age = live.value?.heartbeatAgeMs ?? 0

  return isStale(age) ? `${text} · ${t('telemetry.stale', { seconds: Math.round(age / 1000) })}` : text
}

const armed = computed(() => live.value?.armed ?? false)
const modeText = computed(() => live.value ? withAge(live.value.mode) : missing.value)
const armedText = computed(() => {
  const now = live.value

  return now ? withAge(t(now.armed ? 'telemetry.armed' : 'telemetry.disarmed')) : missing.value
})
</script>
