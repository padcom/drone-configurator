<template>
  <div class="page-split">
    <slot />
  </div>
</template>

<script setup lang="ts">
// The columns of a page side by side (a list of groups, the main column, the aside), each of them a `Pane` or a box that scrolls
// by itself. From 1000 px wide the row is as high as its area and its columns do not wrap; below that they wrap and stack and
// the page scrolls. The row is the box the columns fill: it needs a parent that has a height (the screen area, or a flex column
// that gives it the room that is left).
</script>
