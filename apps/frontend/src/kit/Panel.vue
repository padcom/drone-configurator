<template>
  <component :is="tag" class="kit-panel" :class="{ compact }"><slot /></component>
</template>

<script setup lang="ts">
// A surface: the panel colour, a thin edge and 20 px of room (16 compact). It says nothing about what is in it; give it
// an `aria-label` (it falls through) or a heading inside it when it is a region of the page, and a `tag` that fits
// (`section` for a region, `div` when it is only a box).
withDefaults(defineProps<{
  /** The element: `section` unless it says otherwise. */
  tag?: 'section' | 'div' | 'aside' | 'article'
  /** Less room inside, for a panel that sits in a row of them. */
  compact?: boolean
}>(), { tag: 'section', compact: false })
</script>
