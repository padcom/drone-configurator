<template>
  <section class="setup-calibrate" :data-calibrate="kind" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="setup-subheading">{{ t(`setup.battery.${kind}.title`) }}</h3>
    <p class="muted">{{ t(`setup.battery.${kind}.help`) }}</p>
    <p v-if="shown === null" class="muted" role="status">{{ t('setup.battery.noReading') }}</p>
    <template v-else>
      <div class="setup-calibrate-row">
        <label :for="`${uid}-measured`">{{ t(`setup.battery.${kind}.measured`) }}</label>
        <TextInput :id="`${uid}-measured`" v-model="measuredText" :disabled="disabled" />
        <span class="setup-calibrate-shown">{{ t('setup.battery.shown', { value: shown }) }}</span>
      </div>
      <p v-if="proposal !== null" class="setup-proposal">
        <span>{{ param }}</span>
        <span>{{ current }}</span>
        <span aria-hidden="true">→</span>
        <strong>{{ proposal }}</strong>
      </p>
      <p v-if="second" class="setup-warn" role="alert">{{ t('setup.battery.secondLook') }}</p>
      <Checkbox v-if="second" v-model="checked" :disabled="disabled">{{ t('setup.battery.checked') }}</Checkbox>
      <Button :disabled="!usable" @click="use">{{ t('setup.battery.use') }}</Button>
    </template>
  </section>
</template>

<script setup lang="ts">
// A calibration that proposes and never writes: the user types what a meter says, the page works out the new value from what the
// vehicle shows (lib/setup/battery.ts says how), and "Use this value" puts it among the page's choices, to be written with the
// rest after the one question. A reading more than 15% from what the vehicle shows asks for a second look first: a tick that says
// the meter was read again.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { calibrated, needsSecondLook, parseAmount } from '@/lib/setup/battery'

const props = defineProps<{
  /** Which calibration: `voltage` or `current`. */
  kind: 'voltage' | 'current'
  /** The parameter that is worked out (`BATT_VOLT_MULT`). */
  param: string
  /** What it is now, or null when the vehicle does not have it. */
  current: number | null
  /** What the vehicle shows now (volts or amps), or null when it shows nothing. */
  shown: number | null
  /** Whether the page cannot write now (offline, armed, not known to be disarmed): the calibration is off too. */
  disabled: boolean
}>()

const emit = defineEmits<{
  /** The user took the proposed value. */
  use: [value: number]
}>()

const { t } = useI18n()
const uid = useId()
const measuredText = ref('')
const checked = ref(false)
const measured = computed(() => parseAmount(measuredText.value))
const proposal = computed(() => {
  const { current, shown } = props

  return current === null || shown === null || measured.value === null ? null : calibrated(current, measured.value, shown)
})
const second = computed(() => measured.value !== null && props.shown !== null && needsSecondLook(measured.value, props.shown))
const usable = computed(() => !props.disabled && proposal.value !== null && (!second.value || checked.value))

/** Hands the proposed value to the page, and forgets the reading. */
function use(): void {
  if (proposal.value !== null) {
    emit('use', proposal.value)
    measuredText.value = ''
    checked.value = false
  }
}
</script>
