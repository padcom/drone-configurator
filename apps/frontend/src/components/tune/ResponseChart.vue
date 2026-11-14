<template>
  <section class="tune-response" :aria-labelledby="`${uid}-title`">
    <h4 :id="`${uid}-title`" class="setup-label">{{ t('tune.chart.title') }}</h4>
    <StepChart
      :actual="actual"
      :desired="desired"
      :metrics="metrics"
      :stale="stale"
      :ids="IDS"
      :chart-title="t('tune.chart.chartTitle')"
      :empty-text="t('tune.chart.noData')"
      :stale-text="t('tune.chart.stale')"
      :no-step-text="t('tune.chart.noStep', { seconds: SHOWN_S })"
    />
    <p v-if="problem !== null" id="tune-response-problem" class="muted" role="status">{{ problem }}</p>
    <p v-for="line in missing" :key="line" class="muted tune-response-missing">{{ line }}</p>
    <p id="tune-dropped" class="muted">{{ t('tune.chart.dropped', { count: dropped }) }}</p>
  </section>
</template>

<script setup lang="ts">
// The live response of the roll rate: the ACTUAL rate and the DESIRED one, as the vehicle sends them (the points of the stream
// and nothing else: moving a slider changes nothing here, there is no preview of what the vehicle will do), and under it the
// overshoot, the rise and the settling measured of the latest step of the desired rate in the last seconds. Without data it says
// so ("No data: fly or connect"), old data is marked, a number that cannot be measured is a dash with the reason ("No step in the
// last 10 seconds"), and the points the backend had to drop are counted.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import StepChart from '@/components/tune/StepChart.vue'
import type { TuningAsked } from '@/generated/app'
import { SHOWN_S } from '@/lib/tune/responseView'
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

/** The element ids of the live chart. */
const IDS = {
  chart: 'tune-response-chart',
  overshoot: 'tune-overshoot',
  rise: 'tune-rise',
  settling: 'tune-settling',
  step: 'tune-step',
}

const { t } = useI18n()
const uid = useId()
const metrics = computed(() => measureStep(props.desired, props.actual))

/** What the vehicle did not take: a line it does not send is not there, and the page says so. */
const missing = computed(() => props.asked === null
  ? []
  : [...(props.asked.actual ? [] : [t('tune.chart.noActual')]), ...(props.asked.desired ? [] : [t('tune.chart.noDesired')])])
</script>
