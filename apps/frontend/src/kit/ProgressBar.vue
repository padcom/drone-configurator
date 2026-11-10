<template>
  <div
    class="kit-progress"
    :class="tone"
    role="progressbar"
    :aria-label="label"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
  >
    <span class="fill" :style="{ width: `${percent}%` }" />
  </div>
</template>

<script setup lang="ts">
// How far something has got (a parameter download, a hold): 6 px high, the accent filling from the left. The percent is
// said to a screen reader too; the number next to it, if there is one, is the caller's.
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** How far, from 0 (nothing) to 1 (done); anything outside is held to that range. */
  value: number
  /** What is in progress, for a screen reader. */
  label: string
  /** The colour of the fill: the accent, or the caution colour. */
  tone?: 'accent' | 'warn'
}>(), { tone: 'accent' })

const percent = computed(() => Math.round(Math.min(1, Math.max(0, Number.isFinite(props.value) ? props.value : 0)) * 100))
</script>
