<template>
  <nav class="kit-section-nav" :aria-label="label">
    <RouterLink v-for="section in sections" :key="section.id" :to="section.to" class="tab">{{ section.label }}</RouterLink>
  </nav>
</template>

<script setup lang="ts">
// The tabs of a screen with parts (Logs: Flights, Replay, ...): one link for each part, in a navigation of its own, the part that
// is shown marked by colour and by `aria-current="page"` (RouterLink does that for the link of the address that is shown). They
// are links, not a tab list: each part is a page with an address of its own, so a keyboard moves over them with Tab, a screen
// reader says which one is current, and the browser's own commands (middle click) work.
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  /** What the navigation is called, for a screen reader ("Logs sections"). */
  label: string
  /** The parts, in order: a name that is the same in every language, where each goes, and the words on its tab. */
  sections: ReadonlyArray<{ id: string, to: RouteLocationRaw, label: string }>
}>()
</script>
