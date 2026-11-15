
<template>
  <section class="replay-jumps" :aria-label="t('logs.replay.jump.title')">
    <h4 class="replay-jumps-title">{{ t('logs.replay.jump.title') }}</h4>
    <p v-if="rows.length === 0" id="replay-jumps-none" class="muted">{{ t('logs.replay.jump.none') }}</p>
    <ul v-else class="replay-jump-list">
      <li v-for="(row, i) in rows" :key="i">
        <Button class="replay-jump" :data-at="row.t" :aria-label="row.label" @click="emit('go', row.t)">
          <span class="replay-jump-time">{{ row.at }}</span>
          <span class="replay-jump-what">{{ row.what }}</span>
        </Button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// The events of the flight to jump to: the vehicle armed and disarmed, changes of flight mode, and the warnings it printed (its
// own words, as a line of text: never as markup). A button for each; going to one moves the replay's moment and nothing else.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import { clockOf, modeName } from '@/lib/logs/localLogs'
import type { Jump } from '@/lib/logs/replay'

const props = defineProps<{
  /** What happened, in time order. */
  jumps: Jump[]
  /** The firmware the log names (its modes are written by name only when they are known). */
  firmware?: string
}>()

const emit = defineEmits<{
  /** A jump was chosen: its time (seconds from the start of the log). */
  go: [time: number]
}>()

const { t } = useI18n()

/**
 * A change of flight mode, in words (the mode by name when the firmware's modes are known, else its number).
 *
 * @param mode the mode number
 * @returns the words
 */
function modeWords(mode: number): string {
  return t('logs.replay.jump.mode', { mode: modeName(props.firmware, mode) ?? t('logs.flights.modes.number', { mode }) })
}

/**
 * What a jump is, in words.
 *
 * @param jump the jump
 * @returns the words
 */
function whatOf(jump: Jump): string {
  const words: Record<Jump['kind'], () => string> = {
    armed: () => t('logs.replay.jump.armed'),
    disarmed: () => t('logs.replay.jump.disarmed'),
    text: () => jump.text ?? '',
    mode: () => modeWords(jump.mode ?? 0),
  }

  return words[jump.kind]()
}

const rows = computed(() => props.jumps.map(jump => {
  const at = clockOf(jump.t)
  const what = whatOf(jump)

  return { t: jump.t, at, what, label: t('logs.replay.jump.go', { at, what }) }
}))
</script>
