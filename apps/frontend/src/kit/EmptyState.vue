<template>
  <div class="kit-empty">
    <component :is="`h${level}`" class="title">{{ title }}</component>
    <p class="help">{{ help }}</p>
    <div v-if="$slots.default" class="actions"><slot /></div>
  </div>
</template>

<script setup lang="ts">
// What a place says when there is nothing in it: what is missing, what it takes to have it, and, when there is one thing
// to do about it, that one action (the slot: a Button). Never a blank panel.
withDefaults(defineProps<{
  /** What is missing ("No parameters yet"). */
  title: string
  /** What to do or wait for to have it. */
  help: string
  /** The level of its heading, 2 to 4, to fit under the heading of the place it is in. */
  level?: 2 | 3 | 4
}>(), { level: 3 })
</script>
