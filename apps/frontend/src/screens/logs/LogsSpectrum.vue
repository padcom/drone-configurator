
<template>
  <section class="logs-spectrum" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="logs-flights-title">{{ t('logs.spectrum.title') }}</h3>
    <p id="spectrum-status" class="visually-hidden" role="status">{{ statusText }}</p>
    <Banner
      v-if="spectrum.error.value"
      id="spectrum-error"
      tone="error"
      :role="spectrum.phase.value === 'failed' ? 'presentation' : undefined"
    >
      {{ spectrum.error.value }}
    </Banner>

    <div class="logs-toolbar spectrum-picker">
      <label class="browser-pick">
        <span>{{ t('logs.spectrum.log') }}</span>
        <Select id="spectrum-log" :model-value="spectrum.open.value ?? ''" :options="logOptions" @update:model-value="choose" />
      </label>
      <label v-if="sourceOptions.length > 1" class="browser-pick">
        <span>{{ t('logs.spectrum.sensor') }}</span>
        <Select
          id="spectrum-source"
          :model-value="spectrum.chosen.value ?? ''"
          :options="sourceOptions"
          @update:model-value="pick"
        />
      </label>
    </div>

    <div v-if="busy" class="flight-reading">
      <ProgressBar :value="fraction" :label="t('logs.spectrum.reading', { id: openId })" />
      <span id="spectrum-busy" class="muted">{{ busyText }}</span>
      <Button id="spectrum-stop" @click="spectrum.cancel()">{{ t('logs.flights.stop') }}</Button>
    </div>
    <EmptyState
      v-else-if="spectrum.phase.value === 'idle'"
      :title="t('logs.spectrum.idle.title')"
      :help="t('logs.spectrum.idle.help')"
      :level="4"
    />
    <EmptyState
      v-else-if="spectrum.phase.value === 'none'"
      id="spectrum-none"
      :title="t('logs.spectrum.none.title')"
      :help="t('logs.spectrum.none.help')"
      :level="4"
    >
      <a id="spectrum-capture" href="#/logs/tools">{{ t('logs.spectrum.none.link') }}</a>
    </EmptyState>
    <template v-else-if="result">
      <p class="muted spectrum-facts">{{ factsText }}</p>
      <Banner v-if="mixedRates" id="spectrum-mixed" tone="warn">{{ t('logs.spectrum.mixed') }}</Banner>
      <Banner v-if="result.silent" id="spectrum-silent" tone="warn">{{ t('logs.spectrum.silent') }}</Banner>
      <template v-else>
        <SpectrumChart
          :title="t('logs.spectrum.chart', { sensor: sensorName, unit: result.unit })"
          :axes="result.axes"
          :resolution="result.resolutionHz"
          :unit="result.unit"
          :peak="result.peak"
          :bands="bands"
        />
        <p v-if="!result.peak" id="spectrum-no-peak" class="muted">{{ t('logs.spectrum.noPeak') }}</p>
        <table v-else class="logs-table spectrum-peak">
          <caption class="visually-hidden">{{ t('logs.spectrum.peakTitle') }}</caption>
          <thead>
            <tr>
              <th scope="col">{{ t('logs.spectrum.peakWhat') }}</th>
              <th scope="col">{{ t('logs.spectrum.frequency') }}</th>
              <th scope="col">{{ t('logs.spectrum.amplitude', { unit: result.unit }) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in peakRows" :key="line.n" :data-n="line.n">
              <th scope="row">{{ line.what }}</th>
              <td>{{ line.hz }}</td>
              <td>{{ line.amplitude }}</td>
            </tr>
          </tbody>
        </table>
        <Spectrogram
          :title="t('logs.spectrum.spectrogram')"
          :rows="result.rows"
          :columns="result.columns"
          :nyquist="nyquist"
          :first-us="firstUs"
        />
      </template>
      <NotchPreview v-model="notch" :from-vehicle="fromVehicle" />
      <SpectrumSuggest
        v-if="result.peak && result.sensor === 'gyro'"
        :peak="result.peak"
        :source="{ log: openId, sensor: sensorName, instance: result.instance, unit: result.unit }"
        :firmware="spectrum.summary.value?.firmware"
      />
      <p v-else-if="result.peak" id="spectrum-accel-note" class="muted">{{ t('logs.spectrum.accelNote') }}</p>
      <StagedChanges />
    </template>
  </section>
</template>

<script setup lang="ts">
// "Spectrum": the vibration of a flight by frequency, from the raw IMU batches a log holds (written when the batch sampling is
// on).
// A log is chosen, read, and the spectrum of one sensor made by the backend (an FFT of each batch, averaged): a line for each
// axis,
// the peak and its harmonics, a spectrogram over the flight, and the harmonic notch as entered drawn over it. The values of the
// notch that the peak suggests go to the list of parameter changes, never straight to the vehicle. A log with no batch says how
// to
// capture one; a spectrum of nothing but zeros says so and is not drawn.
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Spectrogram from '@/components/charts/Spectrogram.vue'
import SpectrumChart from '@/components/charts/SpectrumChart.vue'
import StagedChanges from '@/components/params/StagedChanges.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Select from '@/components/ui/Select.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { firstOf, idOf } from '@/composables/useSpectrum'
import { useFormat } from '@/i18n/useFormat'
import { asNumber } from '@/lib/logs/localLogs'
import { notchBands, notchOf } from '@/lib/logs/spectrum'
import NotchPreview from './NotchPreview.vue'
import SpectrumSuggest from './SpectrumSuggest.vue'

defineProps<{
  /** The part of the Logs screen (the router gives it). */
  section: string
}>()

const { t } = useI18n()
const { number } = useFormat()
const uid = useId()
const { spectrum, flights, parameters } = useConfigurator()

/**
 * The words for a sensor.
 *
 * @param source the sensor
 * @param source.sensor gyro or accel
 * @param source.instance its instance
 * @returns "Gyro 0"
 */
function sensorLabel(source: { sensor: string, instance: number }): string {
  return t(`logs.spectrum.${source.sensor}`, { instance: source.instance })
}

/**
 * A frequency and an amplitude, written.
 *
 * @param hz the frequency
 * @param amplitude the amplitude
 * @returns both as text
 */
function numbersOf(hz: number, amplitude: number): { hz: string, amplitude: string } {
  return { hz: number(hz, 1), amplitude: number(amplitude, 3) }
}

const busy = computed(() => ['reading', 'listing', 'computing'].includes(spectrum.phase.value))
const result = computed(() => spectrum.spectrum.value)
const openId = computed(() => flights.logs.value.find(log => log.key === spectrum.open.value)?.id ?? 0)
const firstUs = computed(() => asNumber(spectrum.summary.value?.firstUs ?? 0))
const nyquist = computed(() => (result.value ? result.value.rateHz / 2 : 0))
const chosenSource = computed(() => spectrum.sources.value.find(source => idOf(source) === spectrum.chosen.value))
const sensorName = computed(() => (chosenSource.value ? sensorLabel(chosenSource.value) : ''))
const mixedRates = computed(() => chosenSource.value?.mixedRates === true)
const fraction = computed(() => {
  const progress = spectrum.progress.value

  return progress === null || progress.total === 0 ? 0 : progress.bytes / progress.total
})

const logOptions = computed(() => [
  { value: '', label: t('logs.spectrum.chooseLog') },
  ...flights.logs.value.map(log => ({ value: log.key, label: t('logs.flights.heading', { id: log.id }) })),
])

const sourceOptions = computed(() => spectrum.sources.value.map(source => ({
  value: idOf(source),
  label: t('logs.spectrum.source', {
    sensor: sensorLabel(source),
    count: number(source.batches, 0),
    rate: number(source.rateHz, 0),
  }),
})))

const busyText = computed(() => t(`logs.spectrum.${spectrum.phase.value}`, { id: openId.value }))
const statusText = computed(() => {
  if (busy.value) {
    return busyText.value
  }

  return spectrum.phase.value === 'ready' ? t('logs.spectrum.statusReady', { id: openId.value }) : (spectrum.error.value ?? '')
})

const factsText = computed(() => {
  const r = result.value

  return r === null
    ? ''
    : t('logs.spectrum.facts', {
      batches: number(r.batches, 0),
      skipped: number(r.skipped, 0),
      size: number(r.size, 0),
      resolution: number(r.resolutionHz, 2),
      rate: number(r.rateHz, 0),
    })
})

const peakRows = computed(() => {
  const peak = result.value?.peak
  if (peak === undefined) {
    return []
  }

  return [
    { n: 1, what: t('logs.spectrum.peakAt', { axis: peak.axis.toUpperCase() }), ...numbersOf(peak.hz, peak.amplitude) },
    ...peak.harmonics.map(h => ({ n: h.n, what: t('logs.spectrum.harmonic', { n: h.n }), ...numbersOf(h.hz, h.amplitude) })),
  ]
})

/** The notch as entered, starting from the vehicle's own (else ArduPilot's defaults). */
const start = computed(() => notchOf(parameters.params.value))
const fromVehicle = computed(() => start.value.fromVehicle)
const notch = ref({ ...start.value.setting })
watch(start, now => {
  notch.value = { ...now.setting }
})
const bands = computed(() => notchBands(notch.value, nyquist.value))

/**
 * Opens a log.
 *
 * @param key its key ('' for none)
 */
function choose(key: string): void {
  if (key === '') {
    spectrum.close()
  } else {
    void spectrum.choose(key)
  }
}

/**
 * Shows another sensor of the log.
 *
 * @param id its identity, as `gyro:0`
 */
function pick(id: string): void {
  const source = spectrum.sources.value.find(candidate => idOf(candidate) === id) ?? firstOf(spectrum.sources.value)
  if (source !== undefined) {
    void spectrum.pick(source)
  }
}

if (!flights.listed.value) {
  void flights.refresh()
}
</script>
