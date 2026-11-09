<template>
  <p v-if="!telemetry" class="muted">{{ t('telemetry.none') }}</p>
  <div
    v-for="card in cards"
    v-else
    :key="card.label"
    class="card"
    :class="{ warn: card.warn, stale: card.stale }"
  ><span>{{ card.label }}</span><strong>{{ card.value }}</strong></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cardsFor } from './telemetryCards'
import { useConfigurator } from './useConfigurator'
import { useFormat } from './useFormat'
import { useTelemetry } from './useTelemetry'

const { t } = useI18n()
const format = useFormat()
const { fields } = useConfigurator()
// The telemetry arrives often; this ref changes once per frame at most, and so does the component.
const telemetry = useTelemetry()
// While the backend brings the link back, what is shown is the last that was heard, and each card says so.
const reconnecting = computed(() => fields.connection.value.state === 'reconnecting')
const cards = computed(() => telemetry.value ? cardsFor(telemetry.value, t, format, reconnecting.value) : [])
</script>
