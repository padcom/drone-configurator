<template>
  <div class="tune-row" :data-tune="ids[0]">
    <div class="tune-head">
      <label :for="`${uid}-range`" class="tune-label">{{ label }}</label>
      <code class="tune-names">{{ ids.join(' + ') }}</code>
    </div>
    <div class="tune-controls">
      <input
        :id="`${uid}-range`"
        class="tune-range"
        type="range"
        :min="param.lo"
        :max="param.hi"
        :step="param.step"
        :value="clamped"
        :disabled="off"
        :aria-describedby="`${uid}-note`"
        @input="onRange"
      >
      <TextInput
        class="tune-value"
        :model-value="text"
        :aria-label="t('tune.value', { name: label })"
        :aria-describedby="`${uid}-note`"
        :invalid="note.problem"
        :disabled="off"
        mono
        @update:model-value="onType"
        @blur="typed = null"
      />
      <span v-if="param.units" class="muted">{{ param.units }}</span>
    </div>
    <p class="muted tune-was">{{ was }}</p>
    <!-- Always in the row, empty when there is nothing to say: a status is announced when its text changes, not on insertion. -->
    <p :id="`${uid}-note`" class="tune-note" :class="{ problem: note.problem }" role="status">{{ note.text }}</p>
  </div>
</template>

<script setup lang="ts">
// One slider of the Tune screen: the parameter's name (or the two names of a roll/pitch pair that move together), a slider held
// to ArduPilot's range and a field that takes an exact value, "was X" from the initial values of the session, and what is wrong
// with the value, in words: a value outside the range (a warning, the page still writes it) or beyond the hard limit of the table
// (negative, above its most: it is refused here and in the backend, and the panel does not write while one is chosen). Nothing is
// drawn from the value: there is no preview of what the vehicle will do.
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TextInput from '@/components/ui/TextInput.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { ParamPanel } from '@/composables/useParamPanel'
import { checkMeta } from '@/lib/params/metadata'
import { showNumber } from '@/lib/params/paramValue'
import { type TuneParam, refusalOf, tableMeta } from '@/lib/tune/table'

const props = defineProps<{
  /** What the row is, in words ("Roll and pitch: P"). */
  label: string
  /** The parameters it sets: one, or the pair of a linked roll and pitch. */
  ids: readonly string[]
  /** The table's entry of the first (they share the range). */
  param: TuneParam
  /** The page's parameters. */
  panel: ParamPanel
}>()

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
/** What is typed in the field and is not (yet) the value. */
const typed = ref<string | null>(null)
const first = computed(() => props.ids[0] ?? '')
const value = computed(() => props.panel.value(first.value) ?? props.param.lo)
const text = computed(() => typed.value ?? showNumber(value.value))
const clamped = computed(() => Math.min(props.param.hi, Math.max(props.param.lo, value.value)))
const off = computed(() => props.panel.blocked.value !== null || props.ids.some(id => props.panel.missing.value.includes(id)))

/** What the vehicle had for each of the row's parameters at the first complete download of the session. */
const was = computed(() => {
  const initial = handle.parameters.initial.value?.values
  const values = props.ids.map(id => initial?.get(id)).filter((one): one is number => one !== undefined)
  if (values.length === 0) {
    return t('tune.wasNone')
  }

  return t('tune.was', { value: [...new Set(values.map(showNumber))].join(' / ') })
})

/**
 * What was typed as a number (a comma is a point).
 *
 * @param typedText what is in the field
 * @returns the number, or NaN for nothing or what is not one
 */
function numberOf(typedText: string): number {
  const trimmed = typedText.trim()

  return trimmed === '' ? Number.NaN : Number(trimmed.replace(',', '.'))
}

/**
 * Sets every parameter of the row to one value.
 *
 * @param next the value
 */
function setAll(next: number): void {
  props.ids.forEach(id => props.panel.set(id, next))
}

/**
 * The slider moved.
 *
 * @param event the input event
 */
function onRange(event: Event): void {
  typed.value = null
  setAll(Number((event.target as HTMLInputElement).value))
}

/**
 * Something was typed: a number is the value, even outside the range (that is told, and a value beyond the hard limit is
 * refused).
 *
 * @param next what is in the field
 */
function onType(next: string): void {
  typed.value = next
  const parsed = numberOf(next)
  if (Number.isFinite(parsed)) {
    setAll(parsed)
  }
}

// The field shows the queue: when the value changes under a text that was typed (put back, or written), the text goes.
watch(value, next => {
  if (typed.value !== null && numberOf(typed.value) !== next) {
    typed.value = null
  }
})

/** Why the value is not written, as a message key: a text that is not a number, or a value beyond the hard limit; else null. */
const problem = computed((): string | null => {
  if (typed.value !== null && !Number.isFinite(numberOf(typed.value))) {
    return 'tune.notNumber'
  }
  const refusal = refusalOf(first.value, value.value, props.panel.armed.value)

  return refusal === null ? null : `tune.refused.${refusal}`
})

/** What to say about the value: the problem, else a warning when it is outside the range (the metadata's, else the table's). */
const note = computed((): { text: string, problem: boolean } => {
  if (problem.value !== null) {
    return { text: t(problem.value, { max: props.param.hi, min: props.param.lo }), problem: true }
  }
  const meta = handle.metadata.metadata.value.get(first.value) ?? tableMeta(props.param)

  return { text: checkMeta(meta, value.value) ?? '', problem: false }
})
</script>
