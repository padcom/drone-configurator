<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.failsafes') }}</h3>
      <p class="muted">{{ t('setup.failsafes.summary') }}</p>
      <article
        v-for="row in rows"
        :key="row.kind"
        class="setup-failsafe"
        :class="{ danger: row.danger }"
        :data-failsafe="row.kind"
      >
        <div class="setup-failsafe-text">
          <h4>{{ t(`setup.failsafes.${row.kind}.name`) }}</h4>
          <!-- What the choice does, in plain words; one that does nothing, or stops the motors, says so in a line of its own. -->
          <p class="setup-say">{{ row.say }}</p>
          <p v-if="row.danger" class="setup-warn" role="note">{{ t(`setup.failsafes.warn.${row.action}`) }}</p>
        </div>
        <div v-if="row.threshold" class="setup-threshold">
          <label :for="`${uid}-${row.kind}`">{{ t(`setup.failsafes.${row.kind}.below`) }}</label>
          <TextInput
            :id="`${uid}-${row.kind}`"
            :model-value="String(row.thresholdValue ?? '')"
            :disabled="locked(row.threshold)"
            @update:model-value="setVoltage(row.threshold, $event)"
          />
        </div>
        <EnumField
          :model-value="row.value"
          :options="row.options"
          :label="t('setup.failsafes.then', { name: t(`setup.failsafes.${row.kind}.name`) })"
          :disabled="locked(row.actionParam)"
          @update:model-value="panel.set(row.actionParam, $event)"
        />
      </article>
      <Banner v-if="orderBad" id="setup-order" tone="warn">{{ t('setup.failsafes.order') }}</Banner>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-failsafes" :hold="orderBad" />
  </section>
</template>

<script setup lang="ts">
// Failsafes: what the vehicle does on its own when the battery runs low or critical, the radio is lost, the ground station is
// lost or its position estimate goes bad. Each choice says what it does in words, and a choice that does nothing (the vehicle
// goes on, and only warns) or stops the motors has a warning line of its own. The critical voltage must be below the low one.
// Nothing is written until "Write and verify", and never while the vehicle is armed or may be: a failsafe is a flight-safety
// setting, and "Armed: changes apply in flight" is not offered (the writes are refused, here and in the backend). The actions
// are ArduPilot's own lists (lib/setup/failsafes.ts), which say where in its source they are.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelAside from '@/components/setup/PanelAside.vue'
import Banner from '@/components/ui/Banner.vue'
import TextInput from '@/components/ui/TextInput.vue'
import EnumField from '@/components/fields/EnumField.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import {
  FAILSAFES,
  FAILSAFE_ORDER,
  FAILSAFE_PARAMS,
  type FailsafeKind,
  actionOf,
  choicesOf,
  isDangerous,
  parseVolts,
  voltagesOutOfOrder,
} from '@/lib/setup/failsafes'

const { t } = useI18n()
const uid = useId()
const panel = useParamPanel(FAILSAFE_PARAMS, useConfigurator())
const orderBad = computed(() => voltagesOutOfOrder(panel.value('BATT_LOW_VOLT') ?? 0, panel.value('BATT_CRT_VOLT') ?? 0))

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
 * What a choice does, in a sentence.
 *
 * @param kind the failsafe
 * @param value the parameter's value
 * @returns the sentence
 */
function sayOf(kind: FailsafeKind, value: number): string {
  const action = actionOf(kind, value)
  const does = action === null ? t('setup.failsafes.noName', { value }) : t(`setup.failsafes.does.${action}`)

  return t(`setup.failsafes.if.${kind}`, { does })
}

/**
 * What a failsafe can be set to, named.
 *
 * @param kind the failsafe
 * @returns the options of its field
 */
function optionsOf(kind: FailsafeKind): { value: number, label: string }[] {
  return choicesOf(kind).map(choice => ({ value: choice.value, label: t(`setup.action.${choice.action}`) }))
}

/**
 * The row of a failsafe.
 *
 * @param kind the failsafe
 * @returns what the row shows
 */
function rowOf(kind: FailsafeKind) {
  const { action: actionParam, threshold } = FAILSAFES[kind]
  const value = panel.value(actionParam) ?? 0
  const action = actionOf(kind, value)

  return {
    kind,
    actionParam,
    threshold,
    thresholdValue: threshold === undefined ? null : panel.value(threshold),
    value,
    action: action ?? 'nothing',
    danger: isDangerous(action),
    say: sayOf(kind, value),
    options: optionsOf(kind),
  }
}

const rows = computed(() => FAILSAFE_ORDER.map(rowOf))

/**
 * A voltage as typed: volts that are not negative, else it is not taken.
 *
 * @param id the parameter
 * @param text what was typed
 */
function setVoltage(id: string, text: string): void {
  const volts = parseVolts(text)
  if (volts !== null) {
    panel.set(id, volts)
  }
}
</script>
