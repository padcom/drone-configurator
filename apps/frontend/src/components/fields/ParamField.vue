<template>
  <div class="param-field" :data-status="status">
    <NumberField
      v-if="kind === 'number'"
      :model-value="current"
      :input-id="inputId"
      :label="name"
      :unit="unit"
      :min="min"
      :max="max"
      :step="step"
      :integer="integer"
      :type="type"
      :describedby="statusId"
      :disabled="busy"
      @update:model-value="emit('draft', $event)"
    />
    <EnumField
      v-else-if="kind === 'enum'"
      v-model="chosen"
      :input-id="inputId"
      :options="options"
      :label="name"
      :describedby="statusId"
      :disabled="busy"
    />
    <BitField
      v-else
      :options="bits"
      :type="type ?? 'INT32'"
      :value="current"
      :draft="String(current)"
      :label="name"
      :describedby="statusId"
      :disabled="busy"
      @edit="edited"
      @settle="noop"
    />
    <FieldStatusLine
      :name="name"
      :facts="facts"
      :show="said"
      :rejection="rejection"
      :status-id="statusId"
      @keep="emit('keep')"
      @take="emit('take')"
    />
  </div>
</template>

<script setup lang="ts">
// A field bound to a parameter, of any of the three kinds (a number, a choice from names, the bits of a bitmask): it
// shows what the vehicle holds, or the draft the person made over it, and in words which of these it is
// (lib/params/fieldState.ts): the vehicle's value, modified (and what the vehicle has), a write under way, a write that
// the vehicle read back (verified), a write that it rejected (with the reason), and a CONFLICT, where the vehicle
// changed the parameter itself while there was a draft over it. The draft is kept then, and the person says whether to
// keep it or to take the vehicle's new value. The field only says what it sees and what the person did (`draft`,
// `keep`, `take`): the screen holds the draft and does the write. While a write is under way the control is off, as
// what is typed then could not be written.
import { computed, useId } from 'vue'
import BitField from './BitField.vue'
import EnumField from './EnumField.vue'
import FieldStatusLine from './FieldStatusLine.vue'
import NumberField from './NumberField.vue'
import { type FieldFacts, type FieldStatus, shownValue, statusOf } from '@/lib/params/fieldState'
import type { BitOption } from '@/lib/params/bitmask'
import type { EnumOption } from '@/lib/params/enumField'
import { showStored } from '@/lib/params/numberField'
import { showNumber } from '@/lib/params/paramValue'
import { viewOf } from '@/lib/params/units'

const props = withDefaults(defineProps<{
  /** The parameter's name: what the field is, for a screen reader, and in the conflict's words. */
  name: string
  /** Which control it is: a number, a choice from names, or the bits of a bitmask. */
  kind: 'number' | 'enum' | 'bits'
  /** What the vehicle holds, what the draft is, what the vehicle held when it was begun, and where the write is. */
  facts: FieldFacts
  /** Why the vehicle rejected the write (said with the `rejected` status). */
  rejection?: string
  /** The unit the metadata names (a number). */
  unit?: string
  /** The lowest value, in the stored unit (a number). */
  min?: number
  /** The highest value, in the stored unit (a number). */
  max?: number
  /** The step of the arrow keys, in the stored unit (a number). */
  step?: number
  /** The parameter holds whole numbers (a number). */
  integer?: boolean
  /** The names of the values (a choice). */
  options?: EnumOption[]
  /** The names of the bits (a bitmask). */
  bits?: BitOption[]
  /** The parameter's type, INT16, UINT32, REAL32 and so on: every value is the number the vehicle holds for it. */
  type?: string
  /** The id of the control, for a `<label for>` on the page (the name is then not said a second time). */
  inputId?: string
  /** The control is off whatever the status (the screen cannot write now: the vehicle is armed, say). */
  locked?: boolean
}>(), {
  rejection: undefined,
  unit: undefined,
  min: undefined,
  max: undefined,
  step: undefined,
  integer: false,
  options: () => [],
  bits: () => [],
  type: undefined,
  locked: false,
  inputId: undefined,
})

const emit = defineEmits<{
  /** The person made a draft: its value. */
  draft: [value: number]
  /** The person keeps the draft over what the vehicle changed. */
  keep: []
  /** The person takes the vehicle's new value: the draft is dropped. */
  take: []
}>()

const statusId = useId()
const status = computed<FieldStatus>(() => statusOf(props.facts))
/** What the control shows: the draft, else the vehicle's value (0 before the vehicle has said: the field is off then). */
const current = computed(() => shownValue(props.facts) ?? 0)
const busy = computed(() => props.locked || status.value === 'writing' || status.value === 'unknown')
const chosen = computed({
  get: () => current.value,
  set: (value: number) => emit('draft', value),
})

/**
 * A number in the unit it is shown in, with the unit.
 *
 * @param value the stored value
 * @returns the text
 */
function shown(value: number): string {
  const view = viewOf(props.unit)
  const text = showStored(value, { view, type: props.type })

  return view.unit === '' ? text : `${text} ${view.unit}`
}

/**
 * A value as the text the field shows it (in the shown unit for a number).
 *
 * @param value the value
 * @returns the text
 */
function said(value: number): string {
  return props.kind === 'number' ? shown(value) : showNumber(value)
}

/**
 * The bits were changed: the text of the number they make.
 *
 * @param text the number, as text
 */
function edited(text: string): void {
  const value = Number(text)

  if (Number.isFinite(value)) {
    emit('draft', value)
  }
}

/** The bitmask is settled: the draft was already said with each change. */
function noop(): void {
  // (nothing: every toggle said its draft)
}
</script>
