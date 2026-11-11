<template>
  <div class="kit-banner" :class="[tone, { urgent }]" :role="urgent ? 'alert' : 'status'">
    <Icon class="mark" :name="mark" />
    <div class="text"><slot /></div>
    <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
  </div>
</template>

<script setup lang="ts">
// A message that stays until the condition is over. A banner is a status (read out politely, the soft colour of its tone);
// an `urgent` one is an alert (read out at once, filled): for a failsafe, not for news. The icon says it too, so the tone
// is never colour alone. `urgent` fills the banner in its tone, so it is never an alert that looks like news.
//
// A screen reader reads a live region when its content changes, not always when a region appears with its text in it: for a
// banner that comes up on an event, keep the banner in the page (empty, or `v-show`) and set the text after, as the
// design's own pattern does; a banner that is there from the start (a notice the page opens with) needs nothing.
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{
  /** What it is about. */
  tone?: 'info' | 'warn' | 'error'
  /** Read out at once, and filled: something is wrong now. */
  urgent?: boolean
}>(), { tone: 'warn', urgent: false })

const mark = computed(() => props.tone === 'info' ? 'info' : 'warning')
</script>
