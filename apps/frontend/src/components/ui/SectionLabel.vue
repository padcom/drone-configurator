<template>
  <component :is="`h${level}`" class="kit-section-label"><slot /></component>
</template>

<script setup lang="ts">
// The small capitals that name a section of a screen ("BATTERY", "MESSAGES"). It is a heading, so a screen reader can
// move between the sections; the capitals are drawn by the stylesheet and the words stay as they are written.
withDefaults(defineProps<{
  /** The heading level, 2 to 4. */
  level?: 2 | 3 | 4
}>(), { level: 2 })
</script>
