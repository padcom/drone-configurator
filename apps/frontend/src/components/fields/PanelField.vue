<template>
  <ParamField
    :name="label ?? id"
    :kind="kind"
    :facts="panel.facts(id)"
    :rejection="panel.rejection(id)"
    :unit="unit ?? meta?.units"
    :min="min ?? meta?.min"
    :max="max ?? meta?.max"
    :step="step ?? meta?.increment"
    :integer="integer ?? isInteger"
    :options="options ?? namedValues"
    :bits="bits ?? namedBits"
    :type="type"
    :input-id="inputId"
    :locked="locked"
    :data-param="id"
    @draft="panel.set(id, $event)"
    @keep="panel.keep(id)"
    @take="panel.take(id)"
  />
</template>

<script setup lang="ts">
// A field of a Setup or Tune page bound to one of its panel's parameters (composables/useParamPanel.ts): the kit's ParamField,
// given what the panel knows (the vehicle's value, the choice made here, the write and how it went, a conflict) and saying back
// what the person does. What the screen does not give (the unit, the range, the step, the names of the values or the bits)
// comes from the parameter metadata; without metadata the field is a plain number. It is off while the page cannot write (no
// vehicle, the list still coming, armed outside Tune), for a parameter the vehicle sets itself, and when
// the page turns it off for a reason of its own (`disabled`: a calibration runs, say).
import { computed } from 'vue'
import ParamField from './ParamField.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { ParamPanel } from '@/composables/useParamPanel'
import { type BitOption, bitOptions } from '@/lib/params/bitmask'
import type { EnumOption } from '@/lib/params/enumField'

const props = withDefaults(defineProps<{
  /** The page's parameters. */
  panel: ParamPanel
  /** The parameter. */
  id: string
  /** Which control: a number, a choice from names, or the bits of a bitmask. */
  kind?: 'number' | 'enum' | 'bits'
  /** What the field is called, for a screen reader and in a conflict's words (else the parameter's name). */
  label?: string
  /** The unit (else the metadata's). */
  unit?: string
  /** The lowest value, in the stored unit (else the metadata's). */
  min?: number
  /** The highest value (else the metadata's). */
  max?: number
  /** The step (else the metadata's increment). */
  step?: number
  /** Whole numbers only (else: the parameter is not a REAL32). */
  integer?: boolean
  /** The names of the values (else the metadata's). */
  options?: EnumOption[]
  /** The names of the bits (else the metadata's). */
  bits?: BitOption[]
  /** The id of the control, for a `<label for>` on the page. */
  inputId?: string
  /** The page has the field off for a reason of its own (a calibration runs, say), besides the panel's. */
  disabled?: boolean
}>(), {
  kind: 'number',
  label: undefined,
  unit: undefined,
  min: undefined,
  max: undefined,
  step: undefined,
  integer: undefined,
  options: undefined,
  bits: undefined,
  inputId: undefined,
  disabled: false,
})

const handle = useConfigurator()
const meta = computed(() => handle.metadata.metadata.value.get(props.id))
const type = computed(() => handle.parameters.params.value.find(param => param.id === props.id)?.type)
const isInteger = computed(() => type.value !== undefined && type.value !== 'REAL32')
const namedValues = computed<EnumOption[]>(() => Object.entries(meta.value?.values ?? {})
  .map(([value, label]) => ({ value: Number(value), label }))
  .filter(option => Number.isFinite(option.value)))
/** Off: the page says so, the panel cannot write, or the vehicle sets the parameter itself. */
const locked = computed(() => props.disabled || props.panel.blocked.value !== null || meta.value?.readOnly === true)
const namedBits = computed(() => bitOptions(meta.value?.bits, type.value ?? 'INT32'))
</script>
