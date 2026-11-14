<template>
  <section class="tune-response" :aria-labelledby="`${uid}-title`">
    <h4 :id="`${uid}-title`" class="setup-label">{{ t('tune.chart.title') }}</h4>
    <LineChart
      id="tune-response-chart"
      :title="t('tune.chart.chartTitle')"
      :series="series"
      :stale="stale"
      :stale-text="t('tune.chart.stale')"
      :empty-text="t('tune.chart.noData')"
      :format-x="formatX"
      :format-y="formatY"
    />
    <p v-if="problem !== null" id="tune-response-problem" class="muted" role="status">{{ problem }}</p>
    <p v-for="line in missing" :key="line" class="muted tune-response-missing">{{ line }}</p>
    <dl class="tune-metrics">
      <div>
        <dt>{{ t('tune.chart.overshoot') }}</dt>
        <dd id="tune-overshoot">{{ texts.overshoot }}</dd>
      </div>
      <div>
        <dt>{{ t('tune.chart.rise') }}</dt>
        <dd id="tune-rise">{{ texts.rise }}</dd>
      </div>
      <div>
        <dt>{{ t('tune.chart.settling') }}</dt>
        <dd id="tune-settling">{{ texts.settling }}</dd>
      </div>
    </dl>
    <p id="tune-step" class="muted" role="status">{{ stepText }}</p>
    <p id="tune-dropped" class="muted">{{ t('tune.chart.dropped', { count: dropped }) }}</p>
  </section>
</template>

<script setup lang="ts">
// The live response of the roll rate: the ACTUAL rate and the DESIRED one, as the vehicle sends them (the points of the stream
// and
// nothing else: moving a slider changes nothing here, there is no preview of what the vehicle will do), and under it the
// overshoot, the rise and the settling measured of the latest step of the desired rate in the last seconds. Without data it says
// so ("No data: fly or connect"), old data is marked, a number that cannot be measured is a dash with the reason ("No step in the
// last 10 seconds"), and the points the backend had to drop are counted.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import LineChart, { type LineSeries } from '@/components/charts/LineChart.vue'
import type { TuningAsked } from '@/generated/app'
import { SHOWN_S, linesOf, metricTexts } from '@/lib/tune/responseView'
import { type RatePoint, measureStep } from '@/lib/tune/stepResponse'

const props = defineProps<{
  /** The actual rate. */
  actual: RatePoint[]
  /** The desired rate. */
  desired: RatePoint[]
  /** What is shown is old. */
  stale: boolean
  /** How many points the backend dropped. */
  dropped: number
  /** Whether the vehicle took the request for each message, when it has said. */
  asked: TuningAsked | null
  /** Why the stream is not running, or null. */
  problem: string | null
}>()

const { t } = useI18n()
const uid = useId()
const lines = computed(() => linesOf(props.actual, props.desired))
const series = computed((): LineSeries[] => [
  { id: 'desired', label: t('tune.chart.desired'), points: lines.value.desired, tone: 'muted' },
  { id: 'actual', label: t('tune.chart.actual'), points: lines.value.actual, tone: 'accent' },
])
const metrics = computed(() => measureStep(props.desired, props.actual))
// Old data is not measured as if it were current: the numbers are dashes while the chart says it is old.
const texts = computed(() => metricTexts(props.stale ? null : metrics.value))

/** What the vehicle did not take: a line it does not send is not there, and the page says so. */
const missing = computed(() => props.asked === null
  ? []
  : [...(props.asked.actual ? [] : [t('tune.chart.noActual')]), ...(props.asked.desired ? [] : [t('tune.chart.noDesired')])])

/** What the metrics were measured of, or why there are none. */
const stepText = computed(() => {
  const step = metrics.value
  if (props.stale) {
    return t('tune.chart.oldStep')
  }
  if (step === null) {
    return t('tune.chart.noStep', { seconds: SHOWN_S })
  }

  return t('tune.chart.step', { from: Math.round(step.from), to: Math.round(step.to) })
})

/**
 * A time along the bottom.
 *
 * @param seconds seconds before the newest point
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
