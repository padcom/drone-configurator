
<template>
  <figure class="kit-chart spectrum-chart">
    <figcaption class="chart-head">
      <span class="chart-title">{{ title }}</span>
      <span class="chart-readout" aria-hidden="true">
        <span v-for="axis in axes" :key="axis.name" class="spectrum-legend" :class="`tone-${TONES[axis.name]}`">{{ axis.name.toUpperCase() }}</span>
      </span>
    </figcaption>
    <svg class="spectrum-svg" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" :aria-label="summary">
      <g :transform="`translate(${LEFT}, ${TOP})`">
        <g v-for="tick in plot.yTicks" :key="`y${tick.label}`" class="chart-grid">
          <line x1="0" :x2="BOX.width" :y1="tick.at" :y2="tick.at" />
          <text class="spectrum-tick" x="-6" :y="tick.at + 4" text-anchor="end">{{ tick.label }}</text>
        </g>
        <!-- The notch as entered: the bands it takes out, under the lines. -->
        <rect
          v-for="band in bandRects"
          :key="band.n"
          class="spectrum-band"
          :x="band.x"
          y="0"
          :width="band.width"
          :height="BOX.height"
        >
          <title>{{ t('logs.spectrum.band', { n: band.n, from: band.from, to: band.to }) }}</title>
        </rect>
        <g v-for="line in plot.lines" :key="line.name" class="chart-series" :class="`tone-${TONES[line.name]}`">
          <path class="line" :d="line.d" />
        </g>
        <!-- The peak and its harmonics. -->
        <g v-for="mark in marks" :key="mark.n" class="spectrum-mark" :class="{ peak: mark.n === 1 }">
          <line :x1="mark.x" :x2="mark.x" y1="0" :y2="BOX.height" />
          <text :x="mark.x + 4" y="12">{{ mark.label }}</text>
        </g>
        <g v-for="tick in plot.xTicks" :key="`x${tick.label}`">
          <text class="spectrum-tick" :x="tick.at" :y="BOX.height + 16" text-anchor="middle">{{ tick.label }}</text>
        </g>
      </g>
    </svg>
    <p class="spectrum-axis-label muted">{{ t('logs.spectrum.axes', { unit }) }}</p>
  </figure>
</template>

<script setup lang="ts">
// The amplitude spectrum of the three axes of a sensor, against frequency: a line for each axis, the peak and its harmonics marked,
// and the bands of the harmonic notch as entered (the preview) behind the lines. It is an image with a name and a summary (the
// peak, in words); the peak and its harmonics are also in a table beside it, so that nothing is the picture alone.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SpectrumAxis, SpectrumPeak } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import { plotOf } from '@/lib/charts/spectrumPlot'
import type { NotchBand } from '@/lib/logs/spectrum'

const props = defineProps<{
  /** The title. */
  title: string
  /** The amplitude of each bin, by axis. */
  axes: SpectrumAxis[]
  /** The frequency of one bin (Hz). */
  resolution: number
  /** The unit of the amplitude. */
  unit: string
  /** The peak found, if there is one. */
  peak?: SpectrumPeak
  /** The bands of the notch to preview. */
  bands: NotchBand[]
}>()

const { t } = useI18n()
const { number } = useFormat()

/** The drawing: a box for the plot with room round it for the marks. */
const WIDTH = 1000
const HEIGHT = 300
const LEFT = 56
const TOP = 8
const BOX = { width: WIDTH - LEFT - 10, height: HEIGHT - TOP - 28 }

/** The colour of each axis. */
const TONES: Readonly<Record<string, string>> = { x: 'accent', y: 'ok', z: 'warn' }

const bins = computed(() => props.axes[0]?.amplitude.length ?? 0)
const nyquist = computed(() => props.resolution * Math.max(0, bins.value - 1))
const plot = computed(() => plotOf(props.axes.map(axis => ({ name: axis.name, amplitude: axis.amplitude })), nyquist.value, BOX, v => number(v, v < 10 ? 1 : 0)))

/**
 * Where a frequency is in the box.
 *
 * @param hz the frequency
 * @returns the place along the box
 */
function xOf(hz: number): number {
  return nyquist.value > 0 ? (Math.min(hz, nyquist.value) / nyquist.value) * BOX.width : 0
}

const bandRects = computed(() => props.bands.map(band => ({ n: band.n, from: Math.round(band.from), to: Math.round(band.to), x: xOf(band.from), width: Math.max(1, xOf(band.to) - xOf(band.from)) })))

const marks = computed(() => {
  const { peak } = props
  if (peak === undefined) {
    return []
  }

  return [
    { n: 1, x: xOf(peak.hz), label: `${number(peak.hz, 0)} Hz` },
    ...peak.harmonics.map(h => ({ n: h.n, x: xOf(h.hz), label: `${h.n}×` })),
  ]
})

const summary = computed(() => (props.peak === undefined
  ? t('logs.spectrum.noPeak')
  : t('logs.spectrum.peakSummary', { hz: number(props.peak.hz, 0), amplitude: number(props.peak.amplitude, 2), unit: props.unit })))
</script>
