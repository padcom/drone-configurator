<template>
  <TextInput
    :model-value="text"
    mono
    inputmode="decimal"
    autocomplete="off"
    :invalid="invalid || (text.trim() !== '' && parsed === undefined)"
    @update:model-value="typed"
  />
</template>

<script setup lang="ts">
// A field for a number that may be empty: what is typed is the text; the number it says (empty is "not given") goes to the
// plan as it is typed, so that the plan and the list always say what the field says. A text that is not a number is kept as it
// is (the field is drawn invalid) and the plan holds nothing (null) for it, so the plan says the field is wrong. When the plan
// changes under the field (Undo, another item) the text follows.
import { ref, toValue, watch } from 'vue'
import TextInput from '@/components/ui/TextInput.vue'

const props = defineProps<{
  /** The number the plan holds, or null when none. */
  modelValue: number | null
  /** The plan says the number is not acceptable. */
  invalid?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

/**
 * The number a text says: null for an empty one, undefined for one that is no number.
 *
 * @param text what was typed
 * @returns the number, null or undefined
 */
function numberOf(text: string): number | null | undefined {
  const clean = text.trim().replace(',', '.')
  if (clean === '') {
    return null
  }
  const value = Number(clean)

  return Number.isFinite(value) ? value : undefined
}

/**
 * The text that says a number.
 *
 * @param value the number, or null
 * @returns the text
 */
function textOf(value: number | null): string {
  return value === null ? '' : String(value)
}

const text = ref(textOf(toValue(() => props.modelValue)))
const parsed = ref<number | null | undefined>(toValue(() => props.modelValue))

// The plan changed (an Undo, another item selected): the text says what it holds, unless it already says that.
// A text that is no number is held by the plan as nothing (null: the plan then says the field is wrong), so it is the text that
// stays, not what the plan holds.
watch(() => props.modelValue, value => {
  if ((parsed.value ?? null) !== value) {
    text.value = textOf(value)
    parsed.value = value
  }
})

/**
 * What was typed: kept, and told to the plan. A text that is no number is told as nothing, so that the plan never keeps the
 * number that was there before while the field shows something else.
 *
 * @param value the text
 */
function typed(value: string): void {
  text.value = value
  parsed.value = numberOf(value)

  if ((parsed.value ?? null) !== props.modelValue) {
    emit('update:modelValue', parsed.value ?? null)
  }
}
</script>
