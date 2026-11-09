<template>
  <p v-if="!fields.telemetry.value" class="muted">{{ t('telemetry.none') }}</p>
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
import { useConfigurator } from './useConfigurator'
import { useFormat } from './useFormat'

const { t } = useI18n()
const format = useFormat()
const { fields } = useConfigurator()
const cards = computed(() => fields.telemetry.value ? cardsFor(fields.telemetry.value, t, format) : [])
</script>
