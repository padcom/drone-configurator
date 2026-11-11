<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <path :d="ICONS[name]" />
  </svg>
</template>

<script setup lang="ts">
import { ICONS, type IconName } from '@/lib/ui/icons'

// An icon is as big as the text around it (1em) and the colour of it. With a `label` it is an image with that name;
// without one it is decoration, and a screen reader skips it (the text next to it says what it means).
defineProps<{
  /** Which icon. */
  name: IconName
  /** What it says, when nothing next to it does. */
  label?: string
}>()
</script>
