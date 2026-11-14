<template>
  <div class="tune-step-chart">
    <LineChart
      :id="ids.chart"
      :title="chartTitle"
      :series="series"
      :stale="stale"
      :stale-text="staleText"
      :empty-text="emptyText"
      :format-x="formatX"
      :format-y="formatY"
    />
    <dl class="tune-metrics">
      <div>
        <dt>{{ t('tune.chart.overshoot') }}</dt>
        <dd :id="ids.overshoot">{{ texts.overshoot }}</dd>
      </div>
      <div>
        <dt>{{ t('tune.chart.rise') }}</dt>
        <dd :id="ids.rise">{{ texts.rise }}</dd>
      </div>
      <div>
        <dt>{{ t('tune.chart.settling') }}</dt>
        <dd :id="ids.settling">{{ texts.settling }}</dd>
      </div>
    </dl>
    <p :id="ids.step" class="muted" role="status">{{ stepText }}</p>
  </div>
</template>

<script setup lang="ts">
// The actual rate and the desired one as two lines, and under them the overshoot, the rise and the settling of a step that was
// measured of them (lib/tune/stepResponse.ts): the part of the Tune screen that the live stream and a flight log share. Only the
// points it is given are drawn; with none it says so, old data is marked and its numbers are dashes, and a number that cannot be
// measured is a dash too.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import LineChart, { type LineSeries } from '@/components/charts/LineChart.vue'
import { linesOf, metricTexts } from '@/lib/tune/responseView'
import type { RatePoint, StepMetrics } from '@/lib/tune/stepResponse'

const props = defineProps<{
  /** The actual rate. */
  actual: RatePoint[]
  /** The desired rate. */
  desired: RatePoint[]
  /** What was measured of the step, or null when there is no step. */
  metrics: StepMetrics | null
  /** What is shown is old. */
  stale: boolean
  /** The element ids of the parts (a page tests them). */
  ids: { chart: string, overshoot: string, rise: string, settling: string, step: string }
  /** The name of the chart. */
  chartTitle: string
  /** What the chart says with no points. */
  emptyText: string
  /** What the chart says for old data. */
  staleText: string
  /** What is said under the numbers when there is no step. */
  noStepText: string
  /** The time the bottom axis counts from (ms of the vehicle's clock), when it is not the newest point. */
  origin?: number
}>()

const { t } = useI18n()
const lines = computed(() => linesOf(props.actual, props.desired, props.origin))
const series = computed((): LineSeries[] => [
  { id: 'desired', label: t('tune.chart.desired'), points: lines.value.desired, tone: 'muted' },
  { id: 'actual', label: t('tune.chart.actual'), points: lines.value.actual, tone: 'accent' },
])
// Old data is not measured as if it were current: the numbers are dashes while the chart says it is old.
const texts = computed(() => metricTexts(props.stale ? null : props.metrics))

/** What the numbers were measured of, or why there are none. */
const stepText = computed(() => {
  if (props.stale) {
    return t('tune.chart.oldStep')
  }

  return props.metrics === null
    ? props.noStepText
    : t('tune.chart.step', { from: Math.round(props.metrics.from), to: Math.round(props.metrics.to) })
})

/**
 * A time along the bottom.
 *
 * @param seconds seconds from the origin (before the newest point, or from the step)
 * @returns the text
 */
function formatX(seconds: number): string {
  return `${Math.round(seconds * 10) / 10} s`
}

/**
 * A rate along the side.
 *
 * @param value degrees a second
 * @returns the text
 */
function formatY(value: number): string {
  return String(Math.round(value))
}
</script>
