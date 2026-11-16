<template>
  <fieldset class="tune-row tune-bits" :data-tune="param.id" :disabled="off">
    <legend class="tune-head">
      <span class="tune-label">{{ label }}</span>
      <code class="tune-names">{{ param.id }}</code>
    </legend>
    <label v-for="option in bits" :key="option.bit" class="tune-bit">
      <input
        type="checkbox"
        :checked="isBitSet(value, option.bit)"
        :aria-describedby="`${uid}-note`"
        @change="toggle(option.bit, $event)"
      >
      {{ option.name }}
    </label>
    <p v-if="help" class="muted tune-help">{{ help }}</p>
    <p class="muted tune-was">{{ was }}</p>
    <p :id="`${uid}-note`" class="tune-note" :class="{ problem: locked }" role="status">{{ note }}</p>
  </fieldset>
</template>

<script setup lang="ts">
// One mask of named bits of the Tune screen (the notch's harmonics and options): the parameter's name, a box for each bit with
// ArduPilot's name of it, "was X" from the initial values of the session. Read only when the vehicle starts, so, like a named
// choice, it is off while the vehicle is armed, and says so.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '@/composables/useConfigurator'
import type { ParamPanel } from '@/composables/useParamPanel'
import { showNumber } from '@/lib/params/paramValue'
import { type NamedBit, isBitSet, withBit } from '@/lib/tune/filters'
import type { TuneParam } from '@/lib/tune/table'

const props = defineProps<{
  /** What the row is, in words. */
  label: string
  /** The table's entry. */
  param: TuneParam
  /** The named bits, the lowest first. */
  bits: NamedBit[]
  /** The page's parameters. */
  panel: ParamPanel
  /** A line that says what to know before changing it, if there is one. */
  help?: string
}>()

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const value = computed(() => props.panel.value(props.param.id) ?? 0)
const locked = computed(() => props.panel.armed.value && !props.param.armedOk)
const off = computed(() => (
  props.panel.blocked.value !== null || locked.value || props.panel.missing.value.includes(props.param.id)
))
const was = computed(() => {
  const initial = handle.parameters.initial.value?.values.get(props.param.id)

  return initial === undefined ? t('tune.wasNone') : t('tune.was', { value: showNumber(initial) })
})
const note = computed(() => {
  if (locked.value) {
    return t('tune.refused.reboot')
  }

  return props.param.armedOk ? '' : t('tune.filters.afterRestart')
})

/**
 * A box was ticked or cleared.
 *
 * @param bit the bit
 * @param event the change event
 */
function toggle(bit: number, event: Event): void {
  props.panel.set(props.param.id, withBit(value.value, bit, (event.target as HTMLInputElement).checked))
}
</script>
