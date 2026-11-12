
<template>
  <section class="logs-flights" :data-section="section" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="logs-flights-title">{{ t('logs.flights.title') }}</h3>
    <Banner v-if="flights.error.value" id="flights-error" tone="error">{{ flights.error.value }}</Banner>
    <div class="logs-toolbar">
      <Button id="flights-refresh" :disabled="flights.loading.value || reading" @click="flights.refresh()">
        {{ t('logs.flights.refresh') }}
      </Button>
    </div>
    <p v-if="flights.loading.value && !flights.listed.value" class="muted">{{ t('logs.flights.loading') }}</p>
    <EmptyState
      v-else-if="flights.listed.value && flights.logs.value.length === 0"
      :title="t('logs.flights.none.title')"
      :help="t('logs.flights.none.help')"
      :level="4"
    />
    <table v-else-if="flights.logs.value.length > 0" class="logs-table flights-table">
      <caption class="visually-hidden">{{ t('logs.flights.title') }}</caption>
      <thead>
        <tr>
          <th scope="col">{{ t('logs.flights.column.id') }}</th>
          <th scope="col">{{ t('logs.flights.column.modified') }}</th>
          <th scope="col">{{ t('logs.flights.column.size') }}</th>
          <th scope="col">{{ t('logs.flights.duration') }}</th>
          <th scope="col">{{ t('logs.flights.column.state') }}</th>
          <th scope="col"><span class="visually-hidden">{{ t('logs.flights.open') }}</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.log.key" :class="{ open: row.open }" :data-key="row.log.key">
          <th scope="row">{{ row.log.id }}</th>
          <td>{{ row.date }}</td>
          <td>{{ row.size }}</td>
          <td class="flights-duration">{{ row.duration }}</td>
          <td class="flights-state">{{ row.state }}</td>
          <td>
            <Button
              class="flights-open"
              :disabled="reading"
              :aria-label="t('logs.flights.openLabel', { id: row.log.id })"
              @click="flights.select(row.log.key)"
            >
              {{ t('logs.flights.open') }}
            </Button>
          </td>
        </tr>
      </tbody>
    </table>

    <section
      v-if="flights.open.value"
      id="flight-detail"
      class="flight-detail"
      :data-phase="flights.phase.value"
      :aria-label="detailTitle"
    >
      <h4 class="flight-detail-title">{{ detailTitle }}</h4>
      <div v-if="flights.phase.value === 'reading'" class="flight-reading">
        <ProgressBar :value="readFraction" :label="t('logs.flights.readingBar', { id: openId })" />
        <span class="muted">{{ t('logs.flights.reading', { id: openId }) }}</span>
        <Button id="flights-stop" @click="flights.cancel()">{{ t('logs.flights.stop') }}</Button>
      </div>
      <!-- A copy that is not verified is not looked into: the reason, and the way to a checked copy. -->
      <template v-else-if="summary && !summary.verified">
        <Banner id="flights-not-verified" tone="warn">{{ t('logs.flights.notVerified') }}</Banner>
        <p class="muted"><a id="flights-download-again" href="#/logs/vehicle">{{ t('logs.flights.downloadAgain') }}</a></p>
      </template>
      <template v-else-if="summary">
        <p class="flight-summary muted">{{ summaryText }}</p>
        <Banner v-if="summary.problems > 0" id="flights-damaged" tone="warn">
          {{ t('logs.flights.damaged', { count: summary.problems }) }}
        </Banner>
        <p v-if="summary.cutEnd" id="flights-cut-end" class="muted">{{ t('logs.flights.cutEnd') }}</p>
        <p v-if="length === null" class="muted">{{ t('logs.flights.noTimes') }}</p>
        <template v-else>
          <FlightModeStrip :spans="spans" :firmware="summary.firmware" :cursor="cursor" />
          <LineChart
            v-for="chart in charts"
            :key="chart.id"
            v-model:cursor="cursor"
            :title="chart.title"
            :series="chart.series"
            :format-x="clockOf"
          />
        </template>
        <h4 class="flight-review-title">{{ t('logs.flights.review.title') }}</h4>
        <FlightReview v-if="flights.review.value" :findings="flights.review.value" :first-us="firstUs" />
      </template>
    </section>
  </section>
</template>

<script setup lang="ts">
// "Flights", the logs on this computer: a table of them (number, last change, size, whether the read found the copy to be
// the vehicle's), a log opened to read it (with progress, and a way to stop), and then what is in it: its length and firmware,
// the flight modes along the time, three charts that share one cursor (attitude, altitude, vibration), and the automatic review.
// The review exists only for a verified log; one that is not verified is shown and says so. A series the log lacks, and a part
// of the time with no samples, say so (no data, a gap): nothing is drawn that the log does not hold.
import { computed, onActivated, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import LineChart, { type LineSeries } from '@/components/charts/LineChart.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'
import type { LocalLog, LocalLogSummary } from '@/generated/app'
import { asNumber, clockOf, lengthOf, modeSpans } from '@/lib/logs/localLogs'
import { sizeText } from '@/lib/logs/vehicleLogs'
import FlightModeStrip from './FlightModeStrip.vue'
import FlightReview from './FlightReview.vue'

defineProps<{
  /** The part of the Logs screen (the router gives it). */
  section: string
}>()

const { t, locale } = useI18n()
const { number } = useFormat()
const uid = useId()
const { flights } = useConfigurator()

/** The place of the cursor shared by the charts (seconds from the start of the log). */
const cursor = ref<number | null>(null)

const reading = computed(() => flights.phase.value === 'reading')
const summary = computed(() => flights.summary.value)
const length = computed(() => (summary.value ? lengthOf(summary.value) : null))
const firstUs = computed(() => asNumber(summary.value?.firstUs ?? 0))
const spans = computed(() => (summary.value ? modeSpans(flights.modes.value, summary.value) : []))
const openLog = computed(() => flights.logs.value.find(log => log.key === flights.open.value))
const openId = computed(() => openLog.value?.id ?? 0)
const detailTitle = computed(() => t('logs.flights.heading', { id: openId.value }))
const readFraction = computed(() => {
  const progress = flights.progress.value

  return progress === null || progress.total === 0 ? 0 : progress.bytes / progress.total
})

/**
 * The line under the title of the open log: how long it is, how many messages, which firmware.
 *
 * @param s what the read found
 * @returns the words
 */
function summaryLine(s: LocalLogSummary): string {
  const values = { length: clockOf(length.value ?? 0), messages: number(s.messages, 0) }

  return s.firmware === undefined
    ? t('logs.flights.summaryNoFirmware', values)
    : t('logs.flights.summary', { ...values, firmware: s.firmware })
}

const summaryText = computed(() => (summary.value ? summaryLine(summary.value) : ''))

/**
 * What the state cell of a log says: what a read found of the copy, or that it has not been opened.
 *
 * @param log the log
 * @returns the words
 */
function stateText(log: LocalLog): string {
  if (log.summary === undefined) {
    return t('logs.flights.state.unread')
  }

  return t(log.summary.verified ? 'logs.flights.state.verified' : 'logs.flights.state.unverified')
}

/**
 * How long the log is, as far as a read said (the times are in the log, so a log that was not read has none to show: a dash,
 * and so is a log that has no times).
 *
 * @param log the log
 * @returns minutes and seconds, or a dash
 */
function durationText(log: LocalLog): string {
  const seconds = log.summary?.verified ? lengthOf(log.summary) : null

  return seconds === null ? '—' : clockOf(seconds)
}

/**
 * When the file was last changed, in the language of the interface.
 *
 * @param log the log
 * @returns the date and time, or the words for none (a file that says it was changed before 1970)
 */
function dateText(log: LocalLog): string {
  const modified = asNumber(log.modified)

  return modified === 0 ? t('logs.flights.noDate') : new Date(modified).toLocaleString(locale.value)
}

const rows = computed(() => flights.logs.value.map(log => ({
  log,
  open: log.key === flights.open.value,
  date: dateText(log),
  size: sizeText(asNumber(log.size), number),
  duration: durationText(log),
  state: stateText(log),
})))

/**
 * One line of a chart: the series the log has, or nothing for one it lacks.
 *
 * @param key the series, `message.field`
 * @param label what the line is called
 * @param tone its colour
 * @returns the line
 */
function line(key: string, label: string, tone: LineSeries['tone']): LineSeries {
  return { id: key, label, tone, points: flights.series.value[key]?.points ?? [] }
}

/**
 * The unit the log names for the first of some series that it names one for.
 *
 * @param keys the series
 * @returns ", unit", or nothing
 */
function unitOf(keys: string[]): string {
  const unit = keys.map(key => flights.series.value[key]?.unit).find(u => u !== undefined)

  return unit === undefined ? '' : `, ${unit}`
}

const charts = computed(() => [
  {
    id: 'attitude',
    title: t('logs.flights.chart.attitude') + unitOf(['ATT.Roll', 'ATT.Pitch']),
    series: [line('ATT.Roll', t('logs.flights.chart.roll'), 'accent'), line('ATT.Pitch', t('logs.flights.chart.pitch'), 'ok')],
  },
  {
    id: 'altitude',
    title: t('logs.flights.chart.altitude') + unitOf(['CTUN.Alt']),
    series: [line('CTUN.Alt', t('logs.flights.chart.alt'), 'accent')],
  },
  {
    id: 'battery',
    title: t('logs.flights.chart.battery') + unitOf(['BAT.Volt']),
    series: [line('BAT.Volt', t('logs.flights.chart.volt'), 'accent')],
  },
  {
    id: 'vibration',
    title: t('logs.flights.chart.vibration') + unitOf(['VIBE.VibeX', 'VIBE.VibeY', 'VIBE.VibeZ']),
    series: [
      line('VIBE.VibeX', t('logs.flights.chart.x'), 'accent'),
      line('VIBE.VibeY', t('logs.flights.chart.y'), 'ok'),
      line('VIBE.VibeZ', t('logs.flights.chart.z'), 'warn'),
    ],
  },
])

onMounted(() => {
  if (!flights.listed.value) {
    void flights.refresh()
  }
})

// The screen is kept alive while another part is shown, and logs may have been downloaded meanwhile (in "On the vehicle"): the
// list is read again whenever this part is shown again (not while it is being read, as on the first show).
onActivated(() => {
  if (flights.listed.value && !flights.loading.value && !reading.value) {
    void flights.refresh()
  }
})
</script>
