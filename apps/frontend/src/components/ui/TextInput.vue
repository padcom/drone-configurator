<template>
  <input
    v-model="model"
    class="kit-input"
    :class="{ invalid, mono, large }"
    type="text"
    :aria-invalid="invalid ? 'true' : undefined"
  >
</template>

<script setup lang="ts">
// A native text field. Its name for a screen reader is the caller's: a `<label for>` or an `aria-label`, which fall
// through to it with `placeholder`, `disabled` and the rest (a different `type` wins over `text`).
//
// `invalid` draws the error colour and sets `aria-invalid`, but a colour is not a message: for a sighted user it is only
// colour. The caller shows why in words next to the field and links it with `aria-describedby` (which falls through too).
const model = defineModel<string>({ default: '' })

defineProps<{
  /** The value is not acceptable: drawn with the error colour, and said so to a screen reader. */
  invalid?: boolean
  /** A value, not words: set in the mono face. */
  mono?: boolean
  /** The 48 px field of a value that is being edited, rather than the 44 px of every other control. */
  large?: boolean
}>()
</script>
