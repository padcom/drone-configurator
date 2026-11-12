
<template>
  <figure class="spectrogram">
    <figcaption class="chart-head">
      <span class="chart-title">{{ title }}</span>
    </figcaption>
    <!-- Time down the page, frequency across: one cell for each row and column the backend gave, shaded by amplitude. -->
    <canvas
      ref="canvas"
      class="spectrogram-canvas"
      role="img"
      :width="columns"
      :height="rows.length"
      :aria-label="t('logs.spectrum.spectrogramLabel', { rows: rows.length, hz: number(nyquist, 0) })"
    />
    <p class="spectrum-axis-label muted">{{ t('logs.spectrum.rowBatches', { count: rowBatches }, rowBatches) }}</p>
    <p class="spectrum-axis-label muted">
      {{ t('logs.spectrum.spectrogramAxes', { hz: number(nyquist, 0), from: clock(first), to: clock(last) }) }}
    </p>
  </figure>
</template>

<script setup lang="ts">
// The spectrogram of a flight: the amplitude of the three axes together, by frequency (across) and time (down). A canvas is the
// drawing (thousands of cells); its name says what it shows and the numbers along it are in the text under it. A row with no
// amplitude is dark: nothing is drawn where the log has nothing.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SpectrumRow } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import { asNumber, clockOf } from '@/lib/logs/localLogs'
import { shadeOf } from '@/lib/logs/spectrum'

const props = defineProps<{
  /** The title. */
  title: string
  /** The rows, in time order. */
  rows: SpectrumRow[]
  /** The columns of a row. */
  columns: number
  /** The frequency of the last column (Hz). */
  nyquist: number
  /** How many batches each row is the mean of. */
  rowBatches: number
  /** The time of the first message of the log (microseconds), which the times are counted from. */
  firstUs: number
}>()

const { t } = useI18n()
const { number } = useFormat()
const canvas = ref<HTMLCanvasElement | null>(null)

const first = computed(() => (asNumber(props.rows[0]?.timeUs ?? 0) - props.firstUs) / 1e6)
const last = computed(() => (asNumber(props.rows.at(-1)?.timeUs ?? 0) - props.firstUs) / 1e6)

/**
 * The time along the log.
 *
 * @param seconds seconds from the start of the log
 * @returns minutes and seconds
 */
function clock(seconds: number): string {
  return clockOf(seconds)
}

/**
 * The context to draw in, if there is one (a test environment has no canvas).
 *
 * @returns the context, or null
 */
function contextOf(): CanvasRenderingContext2D | null {
  return canvas.value?.getContext?.('2d') ?? null
}

/** Draws the cells (not where there is no canvas, or nothing to draw). */
function draw(): void {
  const context = contextOf()
  if (!context || props.rows.length === 0) {
    return
  }
  const largest = Math.max(0, ...props.rows.flatMap(row => row.values))
  const image = context.createImageData(props.columns, props.rows.length)
  props.rows.forEach((row, y) => {
    row.values.forEach((value, x) => {
      const shade = shadeOf(value, largest)
      const at = (y * props.columns + x) * 4
      // Dark where there is nothing, through orange to light where there is most.
      image.data.set([shade, Math.round(shade * 0.7), Math.round(shade * 0.3), 255], at)
    })
  })
  context.putImageData(image, 0, 0)
}

onMounted(draw)
watch(() => props.rows, draw)
</script>
