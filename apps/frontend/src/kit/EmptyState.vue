<template>
  <div class="kit-empty">
    <h3 class="title">{{ title }}</h3>
    <p class="help">{{ help }}</p>
    <div v-if="$slots.default" class="actions"><slot /></div>
  </div>
</template>

<script setup lang="ts">
// What a place says when there is nothing in it: what is missing, what it takes to have it, and, when there is one thing
// to do about it, that one action (the slot: a Button). Never a blank panel.
defineProps<{
  /** What is missing ("No parameters yet"). */
  title: string
  /** What to do or wait for to have it. */
  help: string
}>()
</script>
