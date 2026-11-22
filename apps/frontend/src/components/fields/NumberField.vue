<template>
  <span class="number-field">
    <input
      :id="inputId"
      class="kit-input mono"
      :class="{ invalid: bad }"
      type="text"
      inputmode="decimal"
      :value="text"
      :aria-label="inputId === undefined ? label : undefined"
      :aria-invalid="bad ? 'true' : undefined"
      :aria-describedby="reason === '' ? describedby : reasonId"
      :disabled="disabled"
      @input="typing"
      @keydown="onKey"
      @blur="settle"
    >
    <span v-if="spec.view.unit !== ''" class="unit">{{ spec.view.unit }}</span>
    <span v-if="reason !== ''" :id="reasonId" class="reason">{{ reason }}</span>
    <!-- Said to a screen reader once a value is tried to be settled, not at every key (a "-" on the way to -5 is no problem). -->
    <span class="visually-hidden" role="status">{{ announced }}</span>
  </span>
</template>

<script setup lang="ts">
// A numeric field for a parameter: the value in the unit a person reads (metres for the vehicle's centimetres:
// lib/params/units.ts), held to the parameter's lowest and highest value, and moved by its step with the arrow keys
// (Shift or Page Up and Down: ten steps). What is typed is the person's until it is settled (Enter or leaving the
// field): then it becomes the stored value, in the vehicle's unit, and `update:modelValue` says so; a text that is not
// a value stays, with the reason in words next to it (and for a screen reader), and nothing is said. Escape gives up
// what was typed. Values and limits are in the STORED unit.
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { type NumberSpec, type Parsed, type Problem, parseNumber, showStored, stepped } from '@/lib/params/numberField'
import { viewOf } from '@/lib/params/units'

const props = defineProps<{
  /** The value, in the stored unit. */
  modelValue: number
  /** What the field is, for a screen reader (when no `<label for>` names it). */
  label: string
  /** The id of the field, when a `<label for>` names it. */
  inputId?: string
  /** The unit the metadata names (it is shown converted where it has a better one). */
  unit?: string
  /** The lowest value, in the stored unit. */
  min?: number
  /** The highest value, in the stored unit. */
  max?: number
  /** The step of the arrow keys, in the stored unit. */
  step?: number
  /** The parameter holds whole numbers: a typed value with decimals is taken as the nearest whole number. */
  integer?: boolean
  /** The parameter's type (INT16, REAL32 ...): every value is the number the vehicle holds for it (it reads back equal). */
  type?: string
  /** The id of an element that says more about the field, read after its name. */
  describedby?: string
  /** The field cannot be used now. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** The value was settled (typed and entered, or moved by a key): the stored value. */
  'update:modelValue': [value: number]
}>()

const { t } = useI18n()
const reasonId = useId()
/** What is being typed, or null when nothing is (the field then shows the value). */
const typed = ref<string | null>(null)
/** What a screen reader was told lately of a value that could not be settled (nothing when it was settled or is being typed). */
const announced = ref('')

const spec = computed<NumberSpec>(() => ({
  view: viewOf(props.unit),
  min: props.min,
  max: props.max,
  step: props.step,
  integer: props.integer,
  type: props.type,
}))
const text = computed(() => typed.value ?? showStored(props.modelValue, spec.value))
/** What is typed, as a value or the reason it is not one (null when nothing is typed). */
const parsed = computed<Parsed | null>(() => (typed.value === null ? null : parseNumber(typed.value, spec.value)))

/**
 * A problem in words.
 *
 * @param found the problem
 * @returns the sentence, with the limit and its unit where it has one
 */
function words(found: Problem): string {
  const unit = spec.value.view.unit === '' ? '' : ` ${spec.value.view.unit}`

  return t(`field.number.${found.code}`, { limit: `${found.limit ?? ''}${unit}` })
}

/** Why what is typed is not a value (null when it is one, or nothing is typed). */
const problem = computed<Problem | null>(() => (parsed.value === null || parsed.value.ok ? null : parsed.value.problem))
const bad = computed(() => problem.value !== null)
const reason = computed(() => (problem.value === null ? '' : words(problem.value)))

/**
 * Something was typed.
 *
 * @param event the input event
 */
function typing(event: Event): void {
  typed.value = (event.target as HTMLInputElement).value
  announced.value = ''
}

/**
 * A value that is a value is settled: it is said when it is not the one the field has.
 *
 * @param stored the stored value
 */
function accept(stored: number): void {
  typed.value = null
  announced.value = ''

  if (stored !== props.modelValue) {
    emit('update:modelValue', stored)
  }
}

/** What is typed is settled: it is a value, said when it is not the one the field has, or it stays with its reason, told once. */
function settle(): void {
  const done = parsed.value

  if (done?.ok) {
    accept(done.stored)
  } else if (done !== null) {
    announced.value = reason.value
  }
}

/**
 * The value a step starts from: what is typed when that is a value, else the field's.
 *
 * @returns the stored value
 */
function startOfStep(): number {
  const done = parsed.value

  return done?.ok ? done.stored : props.modelValue
}

/**
 * A step of the arrow keys.
 *
 * @param event the key
 * @param direction 1 up, -1 down
 * @param big whether the step is ten times as long
 */
function step(event: KeyboardEvent, direction: 1 | -1, big: boolean): void {
  const next = stepped(startOfStep(), direction, big || event.shiftKey, spec.value)

  event.preventDefault()
  typed.value = null
  announced.value = ''
  emit('update:modelValue', next)
}

/**
 * Escape: what was typed is given up.
 *
 * @param event the key
 */
function giveUp(event: KeyboardEvent): void {
  if (typed.value !== null) {
    event.preventDefault()
    typed.value = null
    announced.value = ''
  }
}

// The value changed from outside (the vehicle changed it, or the person took its value over a draft): what was typed is not
// the field's any more, so that the field and the status line agree.
watch(() => props.modelValue, () => {
  typed.value = null
  announced.value = ''
})

/** What each key does besides typing. */
const KEYS: Record<string, (event: KeyboardEvent) => void> = {
  ArrowUp: event => step(event, 1, false),
  ArrowDown: event => step(event, -1, false),
  PageUp: event => step(event, 1, true),
  PageDown: event => step(event, -1, true),
  Enter: settle,
  Escape: giveUp,
}

/**
 * A key in the field.
 *
 * @param event the key
 */
function onKey(event: KeyboardEvent): void {
  KEYS[event.key]?.(event)
}
</script>
