<template>
  <div class="setup-calibration-notice">
    <Banner v-if="blockedText" id="calibration-blocked" tone="warn">{{ blockedText }}</Banner>
    <Banner v-if="errorText" id="calibration-error" tone="error" urgent>{{ errorText }}</Banner>
  </div>
</template>

<script setup lang="ts">
// What every calibration page says besides its own controls: why none can start now (no vehicle, armed, not known to be
// disarmed) and what a refused call said. How a calibration ended is a toast (useCalibrationToasts), and the vehicle's own
// texts during it are in the side panel (CalibrationSays).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import { useConfigurator } from '@/composables/useConfigurator'

const { t, te } = useI18n()
const { calibration } = useConfigurator()
const blockedText = computed(() => {
  const why = calibration.blocked.value

  return why === null || calibration.running.value ? '' : t(`setup.calibration.blocked.${why}`)
})
const errorText = computed(() => {
  const code = calibration.errorCode.value
  if (code === null) {
    return ''
  }

  return te(`setup.calibration.error.${code}`) ? t(`setup.calibration.error.${code}`) : calibration.errorMessage.value ?? code
})
</script>
