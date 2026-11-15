<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.escs') }}</h3>
      <p class="muted">{{ t('setup.escs.summary') }}</p>
      <RebootBanner :show="rebootNeeded" />
      <div class="setup-esc">
        <label :for="protocol === null ? undefined : `${uid}-pwm`">{{ t('setup.motors.protocol') }}</label>
        <EnumField
          v-if="protocol !== null"
          :input-id="`${uid}-pwm`"
          :model-value="protocol"
          :options="PWM_TYPES"
          :label="t('setup.motors.protocol')"
          :disabled="locked(PWM_TYPE)"
          @update:model-value="panel.set(PWM_TYPE, $event)"
        />
        <span v-else id="setup-protocol-unknown" class="muted">{{ t('setup.motors.protocolUnknown') }}</span>
      </div>
      <p class="muted">{{ t('setup.motors.protocolHelp') }}</p>
      <div v-for="spin in spins" :key="spin.id" class="setup-esc" :data-spin="spin.id">
        <label :for="`${uid}-${spin.id}`">{{ t(`setup.motors.${spin.id}`) }}</label>
        <TextInput
          :id="`${uid}-${spin.id}`"
          :model-value="spin.text"
          :invalid="spin.invalid"
          :aria-describedby="`${uid}-${spin.id}-range`"
          :disabled="locked(spin.id)"
          @update:model-value="setSpin(spin.id, $event)"
          @blur="settleSpin(spin.id)"
        />
        <span class="muted">
          {{ t(`setup.motors.${spin.id}Help`) }}
          <span :id="`${uid}-${spin.id}-range`" class="setup-esc-error" role="status" aria-live="polite">{{
            spin.invalid ? t('setup.motors.range') : undefined
          }}</span>
        </span>
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
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from '@/components/fields/EnumField.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import RebootBanner from '@/components/setup/RebootBanner.vue'
import Banner from '@/components/ui/Banner.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { fieldText } from '@/lib/params/paramValue'
import { MOTOR_PARAMS, PWM_TYPE, PWM_TYPES, SPIN_PARAMS, SPIN_RANGES, parseFraction, spinProblem } from '@/lib/setup/motors'

/** A spin field of the page. */
interface SpinField {
  /** The parameter. */
  id: string
  /** What the field shows. */
  text: string
  /** The least the parameter may be. */
  low: number
  /** The most the parameter may be. */
  high: number
  /** What the field shows is not taken (it is not written). */
  invalid: boolean
}

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const panel = useParamPanel(MOTOR_PARAMS, handle)
const rebootNeeded = computed(() => panel.written.value.includes(PWM_TYPE))
/** The ESC protocol the vehicle has, or null when it does not report it (nothing is made up for it). */
const protocol = computed(() => panel.value(PWM_TYPE) ?? null)
const problem = computed(() => spinProblem(panel.value('MOT_SPIN_ARM'), panel.value('MOT_SPIN_MIN'), panel.value('MOT_SPIN_MAX')))
/** What is typed in a spin field and is not (yet) the value: kept while it is not acceptable, so the field says so. */
const typed = ref<Record<string, string>>({})

/**
 * The range a spin threshold may be in.
 *
 * @param id the parameter
 * @returns the least and the most
 */
function rangeOf(id: string): readonly [number, number] {
  return SPIN_RANGES[id] ?? [0, 1]
}

/**
 * Whether what was typed for a spin threshold is taken.
 *
 * @param id the parameter
 * @param text what was typed
 * @returns true if it is a fraction in the threshold's range
 */
function accepted(id: string, text: string): boolean {
  const [low, high] = rangeOf(id)

  return parseFraction(text, low, high) !== null
}

/**
 * A spin field as the page shows it: what is typed if that is not taken (marked invalid, with the range said), else the value.
 *
 * @param id the parameter
 * @returns the field
 */
function spinField(id: string): SpinField {
  const [low, high] = rangeOf(id)
  const edited = typed.value[id]
  const text = edited ?? fieldText(panel.value(id))

  return { id, text, low, high, invalid: edited !== undefined && !accepted(id, edited) }
}

const spins = computed(() => SPIN_PARAMS.map(id => spinField(id)))

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
 * A spin threshold as typed: a fraction in its range, else it is not taken (and the field says so).
 *
 * @param id the parameter
 * @param text what was typed
 */
function setSpin(id: string, text: string): void {
  const [low, high] = rangeOf(id)
  const value = parseFraction(text, low, high)
  typed.value = { ...typed.value, [id]: text }

  if (value !== null) {
    panel.set(id, value)
  }
}

/**
 * The field lost the focus: what is typed and was taken gives way to the value; what was not stays, marked, so the field never
 * shows a value that will not be written without saying so.
 *
 * @param id the parameter
 */
function settleSpin(id: string): void {
  if (accepted(id, typed.value[id] ?? '')) {
    typed.value = Object.fromEntries(Object.entries(typed.value).filter(([key]) => key !== id))
  }
}
</script>
