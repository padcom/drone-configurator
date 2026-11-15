
<template>
  <section class="replay-transport" :aria-label="t('logs.replay.transport.title')">
    <div class="replay-buttons">
      <Button id="replay-play" variant="primary" @click="emit('toggle')">{{ playLabel }}</Button>
      <span id="replay-clock" class="replay-clock" aria-hidden="true">{{ clock }}</span>
    </div>
    <!-- The place in the flight: a range, so the arrows, Home, End and Page keys move it (the browser's own keys). Moving it
         asks the backend for nothing: the track is in memory. -->
    <input
      id="replay-scrub"
      class="replay-scrub"
      type="range"
      min="0"
      :max="length"
      step="0.1"
      :value="time"
      :aria-label="t('logs.replay.transport.scrub')"
      :aria-valuetext="clock"
      @input="scrub"
    >
    <div class="replay-speeds" role="group" :aria-label="t('logs.replay.transport.speed')">
      <Button
        v-for="option in SPEEDS"
        :key="option"
        class="replay-speed"
        :data-speed="option"
        :aria-pressed="option === speed ? 'true' : 'false'"
        @click="emit('speed', option)"
      >
        {{ t('logs.replay.transport.speedOption', { speed: option }) }}
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
// Play and pause, the place in the flight (a range, labelled with the clock), the clock and the speeds (0.5x to 8x, as
// buttons: the one in use is marked by `aria-pressed`, not by colour alone). The moment is the page's: this only says what the
// user asked.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import { clockOf } from '@/lib/logs/localLogs'
import { SPEEDS } from '@/lib/logs/replay'

const props = defineProps<{
  /** The moment (seconds from the start of the log). */
  time: number
  /** How long the log is (seconds). */
  length: number
  /** Whether it runs. */
  playing: boolean
  /** How many seconds of the log pass in one second. */
  speed: number
}>()

const emit = defineEmits<{
  /** Play or pause was pressed. */
  toggle: []
  /** A speed was chosen. */
  speed: [speed: number]
  /** The range was moved to a moment. */
  seek: [time: number]
}>()

const { t } = useI18n()
const clock = computed(() => t('logs.replay.transport.clock', { at: clockOf(props.time), total: clockOf(props.length) }))
const playLabel = computed(() => t(props.playing ? 'logs.replay.transport.pause' : 'logs.replay.transport.play'))

/**
 * The range was moved.
 *
 * @param event the input event
 */
function scrub(event: Event): void {
  emit('seek', Number((event.target as HTMLInputElement).value))
}
</script>
