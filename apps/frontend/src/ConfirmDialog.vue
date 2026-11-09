<template>
  <SafetyConfirm v-if="confirmation" :key="confirmation.question" :options="options" @answer="confirmation.answer" />
</template>

<script setup lang="ts">
// Hosts the confirmation for whatever asked through `confirm(question)` (a parameter write, applying a snapshot): both
// change how the vehicle flies, so both are asked as `hold`, with the vehicle named. Questions that need more (a typed
// word for an emergency stop) will give their own options when they exist; nothing needs that yet.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SafetyConfirm from './SafetyConfirm.vue'
import type { SafetyOptions } from './safety'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { confirmation, fields } = useConfigurator()

const options = computed<SafetyOptions>(() => {
  const info = fields.connection.value.vehicle

  return {
    title: t('safety.title'),
    what: confirmation.value?.question ?? '',
    vehicle: info ? t('statusBar.vehicleValue', { ...info }) : '',
    level: 'hold',
  }
})
</script>
