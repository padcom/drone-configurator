<template>
  <div class="kit-banner" :class="[tone, { urgent, empty }]" :role="urgent ? 'alert' : 'status'">
    <Icon class="mark" :name="mark" />
    <div v-if="room.length === 0" class="text"><slot /></div>
    <!-- The words it may say, kept in its place unseen: it is as high as the longest of them, whichever it says now. -->
    <div v-else class="text kept">
      <span class="said"><slot /></span>
      <span v-for="(words, index) in room" :key="index" class="room" aria-hidden="true">{{ words }}</span>
    </div>
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
//
// `empty` keeps the banner's place with nothing drawn in it (#562): for a status that comes and goes above controls (the vehicle
// armed, or not known to be disarmed), so that the controls below never move under the pointer when it does. `room` lists the
// words such a banner may say: it is always as high as the longest of them (in a narrow column one may take two lines), so it
// does not grow or shrink when it says another, or nothing.
import { computed } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{
  /** What it is about. */
  tone?: 'info' | 'warn' | 'error'
  /** Read out at once, and filled: something is wrong now. */
  urgent?: boolean
  /** Nothing to say now: the banner keeps its line in the page, and shows nothing (no edge, no colour, no icon). */
  empty?: boolean
  /** Every text it may say: it keeps the room of the longest, said or not (none: it is as high as what it says now). */
  room?: readonly string[]
}>(), { tone: 'warn', urgent: false, empty: false, room: () => [] })

const mark = computed(() => props.tone === 'info' ? 'info' : 'warning')
</script>
