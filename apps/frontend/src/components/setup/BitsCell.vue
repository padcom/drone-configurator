<template>
  <BitField
    v-if="param"
    :options="options"
    :type="param.type"
    :value="value"
    :draft="draft"
    :label="label"
    :invalid="invalid"
    :disabled="disabled"
    @edit="edit"
    @settle="settle"
  />
  <span v-else class="muted">—</span>
</template>

<script setup lang="ts">
// A parameter whose bits mean things, as a field of a page that writes by its panel (the Parameters screen has its own
// editor for the same): the names of the bits are the metadata's, a number can be typed, and a number the parameter cannot
// hold is marked and not taken. A parameter the vehicle does not have is a dash. Nothing is sent from here: the panel's
// choice is what is written.
import { computed, ref } from 'vue'
import BitField from '@/components/fields/BitField.vue'
import type { ParamPanel } from '@/composables/useParamPanel'
import { useConfigurator } from '@/composables/useConfigurator'
import { bitOptions, fitsType } from '@/lib/params/bitmask'
import { plainNumber, showNumber } from '@/lib/params/paramValue'

const props = defineProps<{
  /** The page's parameters. */
  panel: ParamPanel
  /** The parameter. */
  id: string
  /** What the field is, for a screen reader. */
  label: string
  /** The field cannot be used now. */
  disabled?: boolean
}>()

/**
 * The number a text is, when a parameter of that type can hold it.
 *
 * @param text what was typed
 * @param type the parameter's type
 * @returns the number, or null
 */
function parse(text: string, type: string): number | null {
  const number = Number(plainNumber(text))

  return text.trim() !== '' && fitsType(number, type) ? number : null
}

const handle = useConfigurator()
const param = computed(() => handle.parameters.params.value.find(candidate => candidate.id === props.id))
const type = computed(() => param.value?.type ?? '')
const options = computed(() => bitOptions(handle.fields.metadata.value.get(props.id)?.bits, type.value))
const value = computed(() => props.panel.value(props.id) ?? 0)
/** What is typed and is not (yet) the value: kept while it is not a number the parameter can hold, so the field says so. */
const typed = ref<string | null>(null)
const draft = computed(() => typed.value ?? showNumber(value.value))
const invalid = computed(() => typed.value !== null && parse(typed.value, type.value) === null)

/**
 * A bit was toggled or a number typed.
 *
 * @param text the new text of the field
 */
function edit(text: string): void {
  typed.value = text
  const number = parse(text, type.value)

  if (number !== null) {
    props.panel.set(props.id, number)
  }
}

/** The value is settled: what was taken gives way to the value, what was not stays, marked. */
function settle(): void {
  if (typed.value !== null && parse(typed.value, type.value) !== null) {
    typed.value = null
  }
}
</script>
