<template>
  <p v-if="!telemetry" class="muted">{{ t('telemetry.none') }}</p>
  <div
    v-for="card in cards"
    v-else
    :key="card.label"
    class="card"
    :class="{ warn: card.warn }"
  ><span>{{ card.label }}</span><strong>{{ card.value }}</strong></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cardsFor } from './telemetryCards'
import { useFormat } from './useFormat'
import { useTelemetry } from './useTelemetry'

const { t } = useI18n()
const format = useFormat()
// The telemetry arrives often; this ref changes once per frame at most, and so does the component.
const telemetry = useTelemetry()
const cards = computed(() => telemetry.value ? cardsFor(telemetry.value, t, format) : [])
</script>
