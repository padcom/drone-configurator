<template>
  <section class="setup-page-body tune-analyse" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('tune.section.analyse') }}</h3>
      <p class="muted">{{ t('tune.analyse.summary') }}</p>
      <p v-if="hasRecordings" id="tune-analyse-tlog" class="muted">{{ t('tune.analyse.tlog') }}</p>
      <p v-if="stored.length === 0" id="tune-analyse-nologs" class="muted">{{ t('tune.analyse.noLogs') }}</p>

      <div v-else class="logs-toolbar spectrum-picker">
        <label class="browser-pick">
          <span>{{ t('tune.analyse.log') }}</span>
          <Select id="tune-analyse-log" v-model="logKey" :options="logOptions" />
        </label>
        <Button id="tune-analyse-run" :disabled="busy || logKey === ''" @click="run">{{ t('tune.analyse.run') }}</Button>
        <div class="tune-axes" role="group" :aria-label="t('tune.analyse.axis')">
          <Button
            v-for="axis in AXIS_NAMES"
            :id="`tune-analyse-axis-${axis}`"
            :key="axis"
            :aria-pressed="analysis.axis.value === axis ? 'true' : 'false'"
            :disabled="busy"
            @click="analysis.pick(axis)"
          >
            {{ t(`tune.axis.${axis}`) }}
          </Button>
        </div>
      </div>

      <p id="tune-analyse-status" class="visually-hidden" role="status">{{ statusText }}</p>
      <Banner v-if="analysis.error.value" id="tune-analyse-error" tone="error">{{ analysis.error.value }}</Banner>
      <Banner v-if="analysis.stopped.value" id="tune-analyse-stopped" tone="warn">{{ t('tune.analyse.stopped') }}</Banner>
      <Banner v-if="different" id="tune-analyse-different" tone="warn">
        {{ t('logs.spectrum.suggest.different', { log: kind.log, vehicle: kind.vehicle }) }}
      </Banner>

      <div v-if="busy" class="flight-reading">
        <ProgressBar :value="fraction" :label="statusText" />
        <span id="tune-analyse-busy" class="muted">{{ statusText }}</span>
        <Button id="tune-analyse-stop" @click="analysis.cancel()">{{ t('logs.flights.stop') }}</Button>
      </div>
      <EmptyState
        v-else-if="analysis.phase.value === 'none'"
        id="tune-analyse-none"
        :title="t(`tune.analyse.none.${analysis.reason.value}.title`)"
        :help="t(`tune.analyse.none.${analysis.reason.value}.help`)"
        :level="4"
      />
      <template v-else-if="current !== undefined">
        <Banner v-if="slow" id="tune-analyse-slow" tone="warn">
          {{ t('tune.analyse.slow', { rate: number(analysis.rateHz.value ?? 0, 0), minimum: MIN_RATE_HZ }) }}
        </Banner>
        <table id="tune-analyse-steps" class="tune-steps">
          <caption class="visually-hidden">{{ t('tune.analyse.steps') }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ t('tune.analyse.at') }}</th>
              <th scope="col">{{ t('tune.analyse.size') }}</th>
              <th scope="col">{{ t('tune.chart.overshoot') }}</th>
              <th scope="col">{{ t('tune.chart.rise') }}</th>
              <th scope="col">{{ t('tune.chart.settling') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="row.atUs" :class="{ chosen: index === analysis.chosen.value }">
              <td>
                <Button
                  :id="`tune-analyse-step-${index}`"
                  :aria-pressed="index === analysis.chosen.value ? 'true' : 'false'"
                  @click="analysis.select(index)"
                >
                  {{ row.at }}
                </Button>
              </td>
              <td>{{ row.size }}</td>
              <td>{{ row.texts.overshoot }}</td>
              <td>{{ row.texts.rise }}</td>
              <td>{{ row.texts.settling }}</td>
            </tr>
          </tbody>
        </table>
        <StepChart
          :actual="current.actual"
          :desired="current.desired"
          :metrics="current.metrics"
          :stale="false"
          :ids="IDS"
          :chart-title="t('tune.analyse.chartTitle', { axis: t(`tune.axis.${analysis.axis.value}`) })"
          :empty-text="t('tune.chart.noData')"
          :stale-text="t('tune.chart.stale')"
          :no-step-text="t('tune.analyse.noStep')"
          :origin="current.atUs / 1000"
        />
      </template>
      <EmptyState
        v-else-if="analysis.phase.value === 'idle'"
        :title="t('tune.analyse.idle.title')"
        :help="t('tune.analyse.idle.help')"
        :level="4"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
// "Analyse the last flight": the step response of an axis, measured of a flight log on this computer. The newest log is
// preselected; "Analyse" reads it and looks at its RATE messages (the desired rate and the actual one) in two passes, with
// progress and a Stop. The steps it finds are listed, the largest first and at most eight; the largest is drawn, with the same
// chart and the same numbers as the live response, and any other can be chosen. Nothing is made up: a log with no RATE says
// which bits of LOG_BITMASK make the vehicle log it, a log with no step that holds says so, a recording (.tlog) has no RATE and
// is not offered, and a log of another kind of vehicle than the connected one is labelled as such.
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StepChart from '@/components/tune/StepChart.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Select from '@/components/ui/Select.vue'
import { AXES, type Axis } from '@/composables/useAnalysis'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'
import { sameKind } from '@/lib/logs/spectrum'
import { MIN_RATE_HZ } from '@/lib/tune/flightSteps'
import { metricTexts } from '@/lib/tune/responseView'

/** The element ids of the chart and its numbers. */
const IDS = {
  chart: 'tune-analyse-chart',
  overshoot: 'tune-analyse-overshoot',
  rise: 'tune-analyse-rise',
  settling: 'tune-analyse-settling',
  step: 'tune-analyse-step',
}

const AXIS_NAMES = Object.keys(AXES) as Axis[]

const { t } = useI18n()
const uid = useId()
const { number } = useFormat()
const { analysis, flights, fields } = useConfigurator()

/** The logs a flight can be read of: the library's dataflash logs, newest first. */
const stored = computed(() => flights.logs.value.filter(log => log.source === 'dataflash'))
const hasRecordings = computed(() => flights.logs.value.some(log => log.source === 'tlog'))
const logOptions = computed(() => stored.value.map(log => ({ value: log.key, label: t('logs.flights.heading', { id: log.id }) })))
/** The log that is chosen: the newest, until another is. */
const choice = ref<string | null>(null)
const logKey = computed({
  get: () => choice.value ?? stored.value[0]?.key ?? '',
  set: (key: string) => {
    choice.value = key
  },
})

const busy = computed(() => ['reading', 'finding', 'measuring'].includes(analysis.phase.value))
const current = computed(() => (analysis.phase.value === 'ready' ? analysis.steps.value[analysis.chosen.value] : undefined))
const slow = computed(() => analysis.rateHz.value !== null && analysis.rateHz.value < MIN_RATE_HZ)
/** How far the pass is: the places measured, or else the bytes of the log read. */
const counts = computed(() => {
  const { measured, progress } = analysis
  const read = progress.value === null ? null : { done: progress.value.bytes, of: progress.value.total }

  return measured.value ?? read ?? { done: 0, of: 0 }
})
const fraction = computed(() => (counts.value.of === 0 ? 0 : counts.value.done / counts.value.of))

const kind = computed(() => sameKind(analysis.summary.value?.firmware, fields.connection.value.vehicle?.type))
const connected = computed(() => fields.connection.value.state === 'connected')
/** A log of another kind of vehicle than the connected one says so (with nothing connected there is nothing to differ from). */
const different = computed(() => analysis.summary.value !== null && connected.value && !kind.value.same)

const rows = computed(() => analysis.steps.value.map(step => ({
  atUs: step.atUs,
  at: t('tune.analyse.second', { seconds: number(step.atUs / 1e6, 1) }),
  size: t('tune.analyse.rate', { value: number(step.size, 0) }),
  texts: metricTexts(step.metrics),
})))

const statusText = computed(() => {
  const measured = analysis.measured.value

  return measured === null ? t(`tune.analyse.phase.${analysis.phase.value}`) : t('tune.analyse.phase.measuring', measured)
})

// A log that is not the one that was read is not shown as if it were: choosing another closes the one that is open.
watch(logKey, () => {
  if (!busy.value) {
    analysis.close()
  }
})

if (!flights.listed.value) {
  void flights.refresh()
}

/** Reads the log that is chosen and measures its steps. */
function run(): void {
  void analysis.choose(logKey.value)
}
</script>
