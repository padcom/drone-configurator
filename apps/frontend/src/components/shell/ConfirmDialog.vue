<template>
  <SafetyConfirm v-if="confirmation" :key="confirmation.question" :options="options" @answer="confirmation.answer" />
</template>

<script setup lang="ts">
// Hosts the confirmation for whatever asked through `confirm(question)` (a parameter write, applying a snapshot), with the
// vehicle named. They are asked as `plain`: the vehicle's read-back, not a hold, is what makes a write safe (the design's
// rule). What needs a hold (arming, an emergency stop) will give its own options when it exists.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SafetyConfirm from './SafetyConfirm.vue'
import type { SafetyOptions } from '@/lib/app/safety'
import { useConfigurator } from '@/composables/useConfigurator'

const { t } = useI18n()
const { confirmation, fields } = useConfigurator()

const options = computed<SafetyOptions>(() => {
  const info = fields.connection.value.vehicle

  return {
    title: t('safety.title'),
    what: confirmation.value?.question ?? '',
    vehicle: info ? t('topBar.vehicleValue', { ...info }) : '',
    level: 'plain',
    confirmLabel: t('confirm.write'),
  }
})
</script>
