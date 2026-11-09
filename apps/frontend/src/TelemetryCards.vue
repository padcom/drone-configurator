<template>
  <p v-if="!fields.telemetry.value" class="muted">No telemetry: connect to a vehicle.</p>
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
import { cardsFor } from './telemetryCards'
import { useConfigurator } from './useConfigurator'

const { fields } = useConfigurator()
const cards = computed(() => fields.telemetry.value ? cardsFor(fields.telemetry.value) : [])
</script>
