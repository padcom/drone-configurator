
<template>
  <ol class="flight-modes" :aria-label="t('logs.flights.modes.title')">
    <li
      v-for="(span, i) in cells"
      :key="i"
      class="flight-mode"
      :class="{ cursor: span.under }"
      :style="{ flexGrow: span.length }"
      :title="span.title"
    >
      <span class="flight-mode-name">{{ span.name }}</span>
      <span class="flight-mode-time muted">{{ span.from }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
// The flight modes along the log, one cell for each stretch, as wide as it lasted. A mode is written by name when the firmware is
// one whose modes are known, else as its number: a number is never turned into a name that may be wrong. The cell under the
// cursor of the charts is marked.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { type ModeSpan, clockOf, modeName } from '@/lib/logs/localLogs'

const props = defineProps<{
  /** The stretches, in order. */
  spans: ModeSpan[]
  /** The firmware the log names, if it does. */
  firmware?: string
  /** The place of the charts' cursor (seconds from the start), or null. */
  cursor: number | null
}>()

const { t } = useI18n()

const cells = computed(() => props.spans.map(span => {
  const name = modeName(props.firmware, span.mode) ?? t('logs.flights.modes.number', { mode: span.mode })

  return {
    name,
    length: span.toS - span.fromS,
    from: clockOf(span.fromS),
    title: `${name}, ${clockOf(span.fromS)} - ${clockOf(span.toS)}`,
    under: props.cursor !== null && props.cursor >= span.fromS && props.cursor < span.toS,
  }
}))
</script>
