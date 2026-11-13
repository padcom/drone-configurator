<template>
  <div class="setup-calibration-notice">
    <Banner v-if="blockedText" id="calibration-blocked" tone="warn">{{ blockedText }}</Banner>
    <Banner v-if="errorText" id="calibration-error" tone="error" urgent>{{ errorText }}</Banner>
    <Banner
      v-if="result"
      id="calibration-result"
      :tone="result.outcome === 'success' ? 'info' : 'warn'"
      :data-outcome="result.outcome"
    >
      <strong>{{ t(`setup.calibration.result.${result.outcome}`) }}</strong>
      <span v-if="result.code"> · {{ t(`setup.calibration.code.${result.code}`, codeFallback) }}</span>
      <span v-if="extra"> · {{ extra }}</span>
      <p v-if="result.unsure" class="setup-warn" role="note">{{ t('setup.calibration.unsure') }}</p>
    </Banner>
    <div v-if="texts.length > 0" id="calibration-texts" class="setup-vehicle-says">
      <h4 class="setup-label">{{ t('setup.calibration.vehicleSays') }}</h4>
      <ul>
        <li v-for="(text, i) in texts" :key="i">{{ text }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// What every calibration page says besides its own controls: why none can start now (no vehicle, armed, not known to be
// disarmed), what a refused call said, how the calibration ended (a success only when the vehicle said so; a failure, a
// cancel or a refusal each in its own words, with the code's reason), and the vehicle's own texts during it (that is how a
// failure is told: they are shown, never swallowed). The vehicle's words that the result repeats are not said twice.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import { useConfigurator } from '@/composables/useConfigurator'

const { t, te } = useI18n()
const { calibration } = useConfigurator()
const { result } = calibration
const texts = computed(() => calibration.state.value.texts)
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
/** The words of the result that the vehicle's texts do not already say (the vehicle's words are English, and shown once). */
const extra = computed(() => {
  const detail = result.value?.detail

  return detail === undefined || texts.value.includes(detail) ? '' : detail
})
/** A code with no words of its own is shown as it is. */
const codeFallback = computed(() => result.value?.code ?? '')
</script>
