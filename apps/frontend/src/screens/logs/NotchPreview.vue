
<template>
  <fieldset id="spectrum-notch" class="spectrum-notch">
    <legend>{{ t('logs.spectrum.notch.title') }}</legend>
    <p class="muted">{{ fromVehicle ? t('logs.spectrum.notch.fromVehicle') : t('logs.spectrum.notch.defaults') }}</p>
    <div class="spectrum-notch-fields">
      <label v-for="field in fields" :key="field.id" class="browser-pick">
        <span>{{ t(`logs.spectrum.notch.${field.id}`) }}</span>
        <TextInput
          :id="`notch-${field.id}`"
          :model-value="String(model[field.id])"
          type="number"
          mono
          :invalid="!Number.isFinite(model[field.id])"
          @update:model-value="set(field.id, $event)"
        />
      </label>
    </div>
    <p class="muted">{{ t('logs.spectrum.notch.preview') }}</p>
  </fieldset>
</template>

<script setup lang="ts">
// The harmonic notch as the user enters it (starting from the vehicle's own values, else ArduPilot's defaults): the base frequency,
// the bandwidth, the attenuation and the harmonics (a bitmask). Nothing is written: the values only decide the bands drawn over the
// spectrum, to see whether they cover the peak and its harmonics.
import { useI18n } from 'vue-i18n'
import TextInput from '@/components/ui/TextInput.vue'
import { type NotchSetting, numberOf } from '@/lib/logs/spectrum'

defineProps<{
  /** Whether the values are the vehicle's (else ArduPilot's defaults, which the page says). */
  fromVehicle: boolean
}>()

const model = defineModel<NotchSetting>({ required: true })
const { t } = useI18n()

/** The fields, in the order the parameters are written. */
const fields: { id: keyof NotchSetting }[] = [{ id: 'freq' }, { id: 'bandwidth' }, { id: 'attenuation' }, { id: 'harmonics' }]

/**
 * A value was typed.
 *
 * @param id which field
 * @param text what was typed (a number field gives a number once it is one)
 */
function set(id: keyof NotchSetting, text: string | number): void {
  model.value = { ...model.value, [id]: numberOf(String(text)) }
}
</script>
