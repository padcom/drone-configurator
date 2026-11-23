<template>
  <div class="tune-row" :data-tune="param.id">
    <div class="tune-head">
      <label :for="`${uid}-field`" class="tune-label">{{ label }}</label>
      <code class="tune-names">{{ param.id }}</code>
    </div>
    <PanelField
      :input-id="`${uid}-field`"
      :panel="panel"
      :id="param.id"
      kind="enum"
      :options="options"
      :label="label"
      :disabled="locked"
    />
    <p class="muted tune-was">{{ was }}</p>
    <p :id="`${uid}-note`" class="tune-note" :class="{ problem: locked }" role="status">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
// One named choice of the Tune screen (the notch's switch and its tracking mode): the parameter's name, ArduPilot's names of the
// values, "was X" from the initial values of the session. A parameter the vehicle reads only when it starts is not written
// while the vehicle is armed: the field is off then, and the row says why (and, disarmed, that the change takes effect after a
// restart). The field is bound to the parameter (components/fields/PanelField.vue): it says in words whether it is the
// vehicle's value, a draft, a write under way, verified or rejected, and asks which to keep when the vehicle changes it under a
// draft.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelField from '@/components/fields/PanelField.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { ParamPanel } from '@/composables/useParamPanel'
import { showNumber } from '@/lib/params/paramValue'
import type { Choice } from '@/lib/tune/filters'
import type { TuneParam } from '@/lib/tune/table'

const props = defineProps<{
  /** What the row is, in words. */
  label: string
  /** The table's entry. */
  param: TuneParam
  /** The names of the values. */
  options: Choice[]
  /** The page's parameters. */
  panel: ParamPanel
}>()

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
/** The vehicle is armed and the parameter is read only when it starts. */
const locked = computed(() => props.panel.armed.value && !props.param.armedOk)
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
</script>
