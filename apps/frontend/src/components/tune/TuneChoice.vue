<template>
  <div class="tune-row" :data-tune="param.id">
    <div class="tune-head">
      <label :for="`${uid}-field`" class="tune-label">{{ label }}</label>
      <code class="tune-names">{{ param.id }}</code>
    </div>
    <EnumField
      :input-id="`${uid}-field`"
      :model-value="panel.value(param.id) ?? 0"
      :options="options"
      :label="label"
      :describedby="`${uid}-note`"
      :disabled="off"
      @update:model-value="panel.set(param.id, $event)"
    />
    <p class="muted tune-was">{{ was }}</p>
    <p :id="`${uid}-note`" class="tune-note" :class="{ problem: locked }" role="status">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
// One named choice of the Tune screen (the notch's switch and its tracking mode): the parameter's name, ArduPilot's names of the
// values, "was X" from the initial values of the session. A parameter the vehicle reads only when it starts is not written
// while the vehicle is armed: the field is off then, and the row says why (and, disarmed, that the change takes effect after a
// restart).
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from '@/components/fields/EnumField.vue'
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
</script>
