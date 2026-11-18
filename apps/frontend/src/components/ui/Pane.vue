<template>
  <component :is="tag" class="pane" :class="{ contain }">
    <div v-if="$slots.top" class="pane-top"><slot name="top" /></div>
    <div class="pane-body"><slot /></div>
    <div v-if="$slots.bottom" class="pane-bottom"><slot name="bottom" /></div>
  </component>
</template>

<script setup lang="ts">
// One column of a page, in three parts: a TOP slot that stays where it is, a body that scrolls (the default slot), and a BOTTOM
// slot that is fixed at the bottom of the column, so that what is in it is always in view while the body scrolls above it.
// From 1000 px wide the column is as high as the area it is in and only its body scrolls; below that everything stacks and the
// page scrolls, as a page does. A body whose content scrolls by itself (a list with its own scrollbar and footer) says
// `contain`: the body is then a column that does not scroll, and what is in it is laid out as it was in the column itself.
// The column is the owner of its box: give it a height (a flex item of a page that is as high as its area) and it does the rest.
withDefaults(defineProps<{
  /** The element: `div`, or `section` or `aside` where the column is that. */
  tag?: string
  /** The content of the body scrolls by itself: the body does not. */
  contain?: boolean
}>(), { tag: 'div', contain: false })
</script>
