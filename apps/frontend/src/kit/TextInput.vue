<template>
  <input v-model="model" class="kit-input" :class="{ invalid }" type="text" :aria-invalid="invalid ? 'true' : undefined">
</template>

<script setup lang="ts">
// A native text field. Its name for a screen reader is the caller's: a `<label for>` or an `aria-label`, which fall
// through to it with `placeholder`, `disabled` and the rest (a different `type` wins over `text`).
const model = defineModel<string>({ default: '' })

defineProps<{
  /** The value is not acceptable: drawn with the error colour, and said so to a screen reader. */
  invalid?: boolean
}>()
</script>
