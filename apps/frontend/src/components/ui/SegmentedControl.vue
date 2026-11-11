<template>
  <div class="kit-segmented" role="radiogroup" :aria-label="label">
    <label v-for="option in options" :key="option.value" class="segment">
      <input v-model="model" type="radio" :name="name" :value="option.value" :disabled="disabled">
      <span>{{ option.label }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'

// A choice of one among a few, drawn as joined segments. Under the drawing it is a group of native radio buttons, so
// the browser does the work: Tab goes into the group once, the arrow keys move and choose, and a screen reader says
// "1 of 3". The group needs a name (`label`).
const model = defineModel<string>({ default: '' })
const name = useId()

defineProps<{
  /** What the choice is about (the name of the group for a screen reader). */
  label: string
  /** What can be chosen. */
  options: { value: string, label: string }[]
  /** Nothing can be chosen. */
  disabled?: boolean
}>()
</script>
