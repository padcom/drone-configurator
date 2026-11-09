<template>
  <span class="kit-badge" :class="tone"><slot /></span>
</template>

<script setup lang="ts">
// A short status in words. The colour says how much it matters, and the words say what it is, so it is never the
// colour alone that tells.
withDefaults(defineProps<{
  /** How it is drawn. */
  tone?: 'neutral' | 'ok' | 'warn' | 'error'
}>(), { tone: 'neutral' })
</script>
