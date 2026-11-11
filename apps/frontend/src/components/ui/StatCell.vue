<template>
  <div class="kit-stat" :class="tone">
    <span class="label">{{ label }}</span>
    <span class="value"><slot /></span>
  </div>
</template>

<script setup lang="ts">
// A label over a value in the mono face, for a row of cells (the top bar's MODE, STATE, BATTERY). The value is a slot,
// so it can be a number with its unit or a TruthValue; what a tone means is in the words, which the caller writes.
withDefaults(defineProps<{
  /** What the value is. */
  label: string
  /** How the value is drawn: `warn` for a state that wants attention (armed), `error` for a failure. */
  tone?: 'default' | 'warn' | 'error'
}>(), { tone: 'default' })
</script>
