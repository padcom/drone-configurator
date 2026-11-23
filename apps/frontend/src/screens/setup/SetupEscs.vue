<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.escs') }}</h3>
      <p class="muted">{{ t('setup.escs.summary') }}</p>
      <RebootBanner :show="rebootNeeded" />
      <div class="setup-esc">
        <label :for="protocol === null ? undefined : `${uid}-pwm`">{{ t('setup.motors.protocol') }}</label>
        <PanelField
          v-if="protocol !== null"
          :input-id="`${uid}-pwm`"
          :panel="panel"
          :id="PWM_TYPE"
          kind="enum"
          :options="PWM_TYPES"
          :label="t('setup.motors.protocol')"
        />
        <span v-else id="setup-protocol-unknown" class="muted">{{ t('setup.motors.protocolUnknown') }}</span>
      </div>
      <p class="muted">{{ t('setup.motors.protocolHelp') }}</p>
      <div v-for="spin in spins" :key="spin.id" class="setup-esc" :data-spin="spin.id">
        <label :for="`${uid}-${spin.id}`">{{ t(`setup.motors.${spin.id}`) }}</label>
        <PanelField
          :input-id="`${uid}-${spin.id}`"
          :panel="panel"
          :id="spin.id"
          :min="spin.low"
          :max="spin.high"
          :step="0.01"
          :integer="false"
          :label="t(`setup.motors.${spin.id}`)"
        />
        <span class="muted">{{ t(`setup.motors.${spin.id}Help`) }}</span>
      </div>
      <Banner v-if="problem !== null" id="setup-spin-order" tone="warn">{{ t('setup.motors.order') }}</Banner>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-escs" :hold="problem !== null" only-changed />
  </section>
</template>

<script setup lang="ts">
// The ESCs: how they are driven (MOT_PWM_TYPE, as ArduPilot's own list; a change takes effect at the next boot, and the page
// says "reboot needed" after the write) and the thresholds the motors spin at (MOT_SPIN_ARM not above MOT_SPIN_MIN, that not
// above MOT_SPIN_MAX, as ArduPilot has it: out of order nothing is written). The motors' own page has the live outputs and
// the motor test. Writes are the page's one question, each read back, and refused while the vehicle is armed or may be (here
// and in the backend).
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelField from '@/components/fields/PanelField.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import RebootBanner from '@/components/setup/RebootBanner.vue'
import Banner from '@/components/ui/Banner.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { MOTOR_PARAMS, PWM_TYPE, PWM_TYPES, SPIN_PARAMS, SPIN_RANGES, spinProblem } from '@/lib/setup/motors'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const panel = useParamPanel(MOTOR_PARAMS, handle)
const rebootNeeded = computed(() => panel.written.value.includes(PWM_TYPE))
/** The ESC protocol the vehicle has, or null when it does not report it (nothing is made up for it). */
const protocol = computed(() => panel.value(PWM_TYPE) ?? null)
const problem = computed(() => spinProblem(panel.value('MOT_SPIN_ARM'), panel.value('MOT_SPIN_MIN'), panel.value('MOT_SPIN_MAX')))
/** The spin thresholds, each with the range ArduPilot documents for it. */
const spins = SPIN_PARAMS.map(id => {
  const [low, high] = SPIN_RANGES[id] ?? [0, 1]

  return { id, low, high }
})
</script>
