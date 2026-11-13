<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.motors') }}</h3>
      <p class="muted">{{ t('setup.motors.summary') }}</p>
      <RebootBanner :show="rebootNeeded" />
      <h4 class="setup-label">{{ t('setup.motors.escTitle') }}</h4>
      <div class="setup-esc">
        <label :for="`${uid}-pwm`">{{ t('setup.motors.protocol') }}</label>
        <EnumField
          :input-id="`${uid}-pwm`"
          :model-value="panel.value(PWM_TYPE) ?? 0"
          :options="PWM_TYPES"
          :label="t('setup.motors.protocol')"
          :disabled="locked(PWM_TYPE)"
          @update:model-value="panel.set(PWM_TYPE, $event)"
        />
      </div>
      <p class="muted">{{ t('setup.motors.protocolHelp') }}</p>
      <div v-for="spin in spins" :key="spin.id" class="setup-esc" :data-spin="spin.id">
        <label :for="`${uid}-${spin.id}`">{{ t(`setup.motors.${spin.id}`) }}</label>
        <TextInput
          :id="`${uid}-${spin.id}`"
          :model-value="spin.text"
          :disabled="locked(spin.id)"
          @update:model-value="setSpin(spin.id, $event)"
        />
        <span class="muted">{{ t(`setup.motors.${spin.id}Help`) }}</span>
      </div>
      <Banner v-if="problem !== null" id="setup-spin-order" tone="warn">{{ t('setup.motors.order') }}</Banner>
      <h4 class="setup-label">{{ t('setup.motors.outputs') }}</h4>
      <EmptyState
        v-if="rows.length === 0"
        :title="t('setup.motors.noOutputs')"
        :help="t('setup.motors.noOutputsHelp')"
        :level="4"
      />
      <table v-else id="setup-outputs" class="setup-outputs">
        <tbody>
          <tr v-for="row in rows" :key="row.output" :data-output="row.output">
            <th scope="row">{{ t('setup.motors.output', { n: row.output }) }}</th>
            <td><ProgressBar :value="row.fraction" :label="t('setup.motors.output', { n: row.output })" /></td>
            <td class="setup-output-pulse">{{ t('setup.motors.pulse', { us: row.pulse }) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-motors" :hold="problem !== null" only-changed />
  </section>
</template>

<script setup lang="ts">
// Motors and outputs: how the ESCs are driven (MOT_PWM_TYPE, as ArduPilot's own list; a change takes effect at the next boot,
// and the page says "reboot needed" after the write), the thresholds the motors spin at (MOT_SPIN_ARM below MOT_SPIN_MIN below
// MOT_SPIN_MAX: out of order nothing is written), and the live outputs of the vehicle (SERVO_OUTPUT_RAW through the `servo`
// telemetry group): a table that is only READ, with nothing here that sends anything to a motor. Writes are the page's one
// question, each read back, and refused while the vehicle is armed or may be (here and in the backend). The motor test is not
// on this page yet.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from '@/components/fields/EnumField.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import RebootBanner from '@/components/setup/RebootBanner.vue'
import Banner from '@/components/ui/Banner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { MOTOR_PARAMS, PWM_TYPE, PWM_TYPES, SPIN_PARAMS, outputRows, parseFraction, spinProblem } from '@/lib/setup/motors'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const panel = useParamPanel(MOTOR_PARAMS, handle)
const rebootNeeded = computed(() => panel.written.value.includes(PWM_TYPE))
const rows = computed(() => outputRows(handle.vehicle.telemetry.value?.servo))
const problem = computed(() => spinProblem(panel.value('MOT_SPIN_ARM'), panel.value('MOT_SPIN_MIN'), panel.value('MOT_SPIN_MAX')))
const spins = computed(() => SPIN_PARAMS.map(id => ({ id, text: String(panel.value(id) ?? '') })))

/**
 * Whether a field of the page cannot be used now: nothing can be written, or the vehicle does not have the parameter.
 *
 * @param id the parameter
 * @returns true if it is off
 */
function locked(id: string): boolean {
  return panel.blocked.value !== null || panel.missing.value.includes(id)
}

/**
 * A spin threshold as typed: a fraction from 0 to 1, else it is not taken.
 *
 * @param id the parameter
 * @param text what was typed
 */
function setSpin(id: string, text: string): void {
  const value = parseFraction(text)
  if (value !== null) {
    panel.set(id, value)
  }
}
</script>
