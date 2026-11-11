<template>
  <select v-model="model" class="kit-select">
    <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
  </select>
</template>

<script setup lang="ts">
// A native select: the keys, the list and `disabled` are the browser's. The labels are the caller's (translated).
const model = defineModel<string>({ default: '' })

defineProps<{
  /** What can be chosen. */
  options: { value: string, label: string }[]
}>()
</script>
