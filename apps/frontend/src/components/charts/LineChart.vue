<template>
  <figure class="kit-chart" :class="{ stale, absent }">
    <figcaption class="chart-head">
      <span class="chart-title">{{ title }}</span>
      <span v-if="stale" class="chart-stale">{{ staleText ?? t('chart.stale') }}</span>
      <!-- What is under the cursor, for the eye; a screen reader has it as the value of the slider below. -->
      <span class="chart-readout" aria-hidden="true">{{ readout }}</span>
    </figcaption>
    <div class="chart-body">
      <ul class="chart-yaxis" aria-hidden="true">
        <li v-for="tick in yTicks" :key="tick.value" :style="{ top: `${tick.at}%` }">{{ formatY(tick.value) }}</li>
      </ul>
      <div class="chart-plot" :style="{ height: `${height}px` }">
        <svg class="chart-svg" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="none" role="img" :aria-label="summary">
          <g v-for="tick in yTicks" :key="`g${tick.value}`" class="chart-grid">
            <line x1="0" :x2="WIDTH" :y1="tick.y" :y2="tick.y" />
          </g>
          <g v-for="line in drawn" :key="line.id" class="chart-series" :class="line.tone">
            <path v-if="line.envelope" class="envelope" :d="line.envelope" />
            <path v-if="line.line" class="line" :d="line.line" />
            <circle v-for="(dot, i) in line.dots" :key="i" class="dot" :cx="dot[0]" :cy="dot[1]" r="2" />
          </g>
          <line v-if="cursorX !== null" class="chart-cursor" :x1="cursorX" :x2="cursorX" y1="0" :y2="HEIGHT" />
        </svg>
        <p v-if="absent" class="chart-empty">{{ emptyText ?? t('chart.noData') }}</p>
        <!-- The cursor, for the pointer and the keyboard: a slider over the plot (Left and Right move it a sample, with Shift
             ten, Home and End to the ends, Escape lets it go). Its value is what the readout says. -->
        <div
          v-else
          class="chart-cursor-control"
          role="slider"
          tabindex="0"
          aria-orientation="horizontal"
          :aria-label="t('chart.cursor', { chart: title })"
          :aria-valuemin="domainX[0]"
          :aria-valuemax="domainX[1]"
          :aria-valuenow="current ?? domainX[0]"
          :aria-valuetext="readout || t('chart.noCursor')"
          @pointermove="onPointer"
          @pointerleave="onLeave"
          @keydown="onKey"
        />
      </div>
    </div>
    <ul class="chart-xaxis" aria-hidden="true">
      <li v-for="tick in xTicks" :key="tick.value" :style="{ left: `${tick.at}%` }">{{ formatX(tick.value) }}</li>
    </ul>
  </figure>
</template>

<script setup lang="ts">
// A line chart of one to three series: the line of each (a gap where a value is absent, never a zero), the envelope of the lowest
// and highest values a point stands for (so a spike one sample wide stays visible in a long series that was thinned), a cursor
// that several charts can share (`v-model:cursor`, the place along the bottom), and the values under it. Absent data says so
// ("No data"), and data that is old says that too ("Old data", drawn dashed and muted): it never looks live.
//
// Drawn in a fixed box that is stretched to the width of its place (the strokes keep their width), with the numbers along the
// axes in HTML, so that they are not stretched with it. The chart is an image with a name and a summary (its range); the cursor
// is a slider over it with the readout as its value, which the keyboard reaches. The arithmetic is in lib/charts/chart.ts.
//
// Values that are not numbers (null, NaN, an infinity: telemetry and logs do carry them) are absent: a gap, "no value" in the
// readout, never drawn and never in the scales. A series is read at a place only where it reaches it (within half its usual
// spacing): one that ended earlier says "no value" there, not its last reading.
//
// The cursor: left out (`cursor` not passed) the chart keeps its own. When a parent passes `cursor`, the cursor is the parent's:
// it must listen to `update:cursor` (that is, use `v-model:cursor`) or the pointer and the keys move nothing that can be seen.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  type ChartPoint,
  type Scale,
  draw,
  extentOf,
  hasValue,
  moveByKey,
  nearest,
  readoutOf,
  scaleOf,
  ticksOf,
  valueAtPointer,
  widened,
} from '@/lib/charts/chart'

/** One line of the chart. */
export interface LineSeries {
  /** Its name in the chart (unique). */
  id: string
  /** What it is called to the user. */
  label: string
  /** Its points, in order of `x`. */
  points: ChartPoint[]
  /** Its colour, by what it says: the accent (default), or a status colour. */
  tone?: 'accent' | 'ok' | 'warn' | 'error' | 'muted'
}

const WIDTH = 600
const HEIGHT = 160

/**
 * Whether a series has a value anywhere.
 *
 * @param line the series
 * @returns true when one of its points has one
 */
function lineHasValue(line: LineSeries): boolean {
  return line.points.some(hasValue)
}

const props = withDefaults(defineProps<{
  /** What the chart shows, as a name ("Altitude, m"). */
  title: string
  /** The lines. */
  series: LineSeries[]
  /** How a value along the left is written. */
  formatY?: (value: number) => string
  /** How a place along the bottom is written. */
  formatX?: (value: number) => string
  /**
   * The place of the cursor along the bottom, or null for none: shared with other charts when they are given the same one.
   * Left out, the chart keeps its own.
   */
  cursor?: number | null
  /** The data is old: it is drawn muted and says so. */
  stale?: boolean
  /** The words for old data, when not "Old data". */
  staleText?: string
  /** The words for no data, when not "No data". */
  emptyText?: string
  /** The height of the plot, in px. */
  height?: number
  /** The values along the left: the series' own reach unless given. */
  domainY?: [number, number]
}>(), {
  formatY: (value: number) => String(Math.round(value * 100) / 100),
  formatX: (value: number) => String(Math.round(value * 100) / 100),
  cursor: undefined,
  stale: false,
  staleText: undefined,
  emptyText: undefined,
  height: 160,
  domainY: undefined,
})
const emit = defineEmits<{ 'update:cursor': [x: number | null] }>()
const { t } = useI18n()

// The cursor is the parent's when it keeps one (so that charts share it), else the chart's own. (When the keys move it, the
// slider's value, which is the readout, is what a screen reader says.)
const own = ref<number | null>(null)
const placed = computed(() => props.cursor === undefined ? own.value : props.cursor)

const extent = computed(() => extentOf(props.series.flatMap(line => line.points)))
const absent = computed(() => extent.value === null)
const domainX = computed<[number, number]>(() => widened(extent.value?.x ?? [0, 1]))
const domainYShown = computed<[number, number]>(() => widened(props.domainY ?? extent.value?.y ?? [0, 1]))
const sx = computed<Scale>(() => scaleOf(domainX.value, [0, WIDTH]))
const sy = computed<Scale>(() => scaleOf(domainYShown.value, [HEIGHT - 4, 4]))

const drawn = computed(() => props.series.map(line => ({
  id: line.id,
  tone: `tone-${line.tone ?? 'accent'}`,
  ...draw(line.points, sx.value, sy.value),
})))
const yTicks = computed(() => ticksOf(domainYShown.value, 4).map(value => ({
  value,
  y: sy.value(value),
  at: sy.value(value) / HEIGHT * 100,
})))
const xTicks = computed(() => ticksOf(domainX.value, 5).map(value => ({ value, at: sx.value(value) / WIDTH * 100 })))

// The points the cursor follows: those of the first series that has a value.
const lead = computed(() => props.series.find(lineHasValue)?.points ?? [])
const current = computed(() => lead.value[placed.value === null ? -1 : nearest(lead.value, placed.value)]?.x ?? null)
const cursorX = computed(() => current.value === null ? null : sx.value(current.value))

const writing = computed(() => ({ formatX: props.formatX, formatY: props.formatY, noValue: t('chart.noValue') }))
const readout = computed(() => current.value === null ? '' : readoutOf(props.series, current.value, writing.value))
const summary = computed(() => {
  const reach = extent.value
  const range = reach === null
    ? props.emptyText ?? t('chart.noData')
    : t('chart.summary', {
      low: props.formatY(reach.y[0]),
      high: props.formatY(reach.y[1]),
      from: props.formatX(reach.x[0]),
      to: props.formatX(reach.x[1]),
    })

  return `${props.title}. ${range}`
})

/**
 * Puts the cursor at a place, here and for whoever shares it.
 *
 * @param x the place, or null to let it go
 */
function place(x: number | null): void {
  own.value = x
  emit('update:cursor', x)
}

/**
 * The cursor follows the pointer over the plot.
 *
 * @param event the pointer event
 */
function onPointer(event: PointerEvent): void {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = valueAtPointer(event.clientX, box.left, box.width, domainX.value)
  if (x !== null) {
    place(lead.value[nearest(lead.value, x)]?.x ?? null)
  }
}

/**
 * The pointer left the plot: the cursor goes, unless the keys are holding it.
 *
 * @param event the pointer event
 */
function onLeave(event: PointerEvent): void {
  if (document.activeElement !== event.currentTarget) {
    place(null)
  }
}

/**
 * The keys move the cursor by samples.
 *
 * @param event the key event
 */
function onKey(event: KeyboardEvent): void {
  const move = moveByKey(event.key, event.shiftKey, lead.value, current.value)
  if (move.kind !== 'ignore') {
    event.preventDefault()
    place(move.kind === 'to' ? move.x : null)
  }
}
</script>
