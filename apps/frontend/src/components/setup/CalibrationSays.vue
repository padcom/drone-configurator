<template>
  <div v-if="texts.length > 0" id="calibration-texts" class="setup-vehicle-says">
    <h3 class="setup-label">{{ t('setup.calibration.vehicleSays') }}</h3>
    <ul>
      <li v-for="(text, i) in texts" :key="i">{{ text }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// What the vehicle says during a calibration (its own status texts, in its own words): in the side panel of the calibration
// pages, while it runs and after it. That is how a failure is told: the texts are shown, never swallowed.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '@/composables/useConfigurator'

const { t } = useI18n()
const { calibration } = useConfigurator()
const texts = computed(() => calibration.state.value.texts)
</script>
