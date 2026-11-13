
<template>
  <section class="logs-flights" :data-section="section" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="logs-flights-title">{{ t('logs.flights.title') }}</h3>
    <!-- Always in the page, so that its words are read out when they change (a read that finished, was stopped or failed). -->
    <p id="flights-status" class="visually-hidden" role="status">{{ statusText }}</p>
    <!-- The error of a log that failed to open is spoken by the status line; the banner shows it and does not speak it again. -->
    <Banner
      v-if="flights.error.value"
      id="flights-error"
      tone="error"
      :role="flights.phase.value === 'failed' ? 'presentation' : undefined"
    >
      {{ flights.error.value }}
    </Banner>
    <div class="logs-toolbar">
      <Button
        id="flights-import"
        :aria-disabled="busyOrLoading ? 'true' : undefined"
        :aria-describedby="busy ? 'flights-busy' : undefined"
        @click="importFile()"
      >
        {{ t('logs.flights.import') }}
      </Button>
      <!-- aria-disabled, not disabled: a button that is turned off while it has the focus must not take the focus with it. -->
      <Button
        id="flights-refresh"
        :aria-disabled="busyOrLoading ? 'true' : undefined"
        :aria-describedby="busy ? 'flights-busy' : undefined"
        @click="refreshList()"
      >
        {{ t('logs.flights.refresh') }}
      </Button>
    </div>
    <!-- Importing a recording: copied into the library a chunk at a time; it can be stopped, and then adds nothing. -->
    <div v-if="flights.importing.value" id="flights-importing" class="flight-reading">
      <ProgressBar :value="readFraction" :label="t('logs.flights.importingBar')" />
      <span id="flights-busy" class="muted">{{ t('logs.flights.importing') }}</span>
      <Button id="flights-stop" @click="flights.cancel()">{{ t('logs.flights.stopImport') }}</Button>
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
          <th scope="col" :title="t('logs.flights.durationTip')">{{ t('logs.flights.duration') }}</th>
          <th scope="col">{{ t('logs.flights.column.state') }}</th>
          <th scope="col"><span class="visually-hidden">{{ t('logs.flights.open') }}</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.log.key" :class="{ open: row.open }" :data-key="row.log.key">
          <th scope="row">{{ row.name }}</th>
          <td>{{ row.date }}</td>
          <td>{{ row.size }}</td>
          <td class="flights-duration">{{ row.duration }}</td>
          <td class="flights-state">{{ row.state }}</td>
          <td>
            <Button
              class="flights-open"
              :aria-disabled="busy ? 'true' : undefined"
              :aria-describedby="busy ? 'flights-busy' : undefined"
              :aria-label="row.openLabel"
              @click="openByKey(row.log.key)"
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
      <h4 ref="title" class="flight-detail-title" tabindex="-1">{{ detailTitle }}</h4>
      <!-- Every view of a recording carries this; nothing in the page can take it away. -->
      <Banner v-if="isTlog && !busy" id="flights-imported-mark" tone="info">{{ t('logs.flights.importedMark') }}</Banner>
      <!-- Reading the file, and then asking for the modes, the review and the charts (two more passes over it): nothing is drawn
           and nothing else is opened until it is through; it can be stopped throughout. -->
      <div v-if="busy" class="flight-reading">
        <ProgressBar
          v-if="flights.phase.value === 'reading'"
          :value="readFraction"
          :label="t('logs.flights.readingBar', { id: openId })"
        />
        <span id="flights-busy" class="muted">{{ busyText }}</span>
        <Button id="flights-stop" @click="flights.cancel()">{{ t('logs.flights.stop') }}</Button>
      </div>
      <!-- A copy that is not verified is not looked into: the reason, and the way to a checked copy. -->
      <template v-else-if="summary && !summary.verified">
        <Banner id="flights-not-verified" tone="warn">
          {{ t(isTlog ? 'logs.flights.notVerifiedImported' : 'logs.flights.notVerified') }}
        </Banner>
        <p v-if="!isTlog" class="muted">
          <a id="flights-download-again" href="#/logs/vehicle">{{ t('logs.flights.downloadAgain') }}</a>
        </p>
      </template>
      <template v-else-if="summary">
        <p class="flight-summary muted">{{ summaryText }}</p>
        <Banner v-if="damage > 0" id="flights-damaged" tone="warn">
          {{ t('logs.flights.damaged', { count: damage }) }}
        </Banner>
        <div v-if="summary.report" id="flights-report" class="muted">
          <p>{{ readText }}</p>
          <p v-if="summary.report.segments > 1">{{ t('logs.flights.reportSegments', { count: summary.report.segments }) }}</p>
          <p v-if="(summary.report.vehicles ?? 0) > 1" id="flights-vehicles">{{ vehiclesText }}</p>
          <p v-if="summary.report.signed > 0">{{ t('logs.flights.reportSigned', { count: summary.report.signed }) }}</p>
          <p v-if="!summary.report.dated">{{ t('logs.flights.reportUndated') }}</p>
          <p v-if="summary.cutEnd" id="flights-cut-end">{{ t('logs.flights.reportCutEnd') }}</p>
        </div>
        <p v-else-if="summary.cutEnd" id="flights-cut-end" class="muted">{{ t('logs.flights.cutEnd') }}</p>
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
        <LogBrowser v-if="length !== null" v-model:cursor="cursor" :first-us="firstUs" />
        <h4 class="flight-review-title">{{ t('logs.flights.review.title') }}</h4>
        <p v-if="isTlog" id="flights-review-tlog" class="muted">{{ t('logs.flights.reviewTlogNote') }}</p>
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
import { computed, nextTick, onActivated, onMounted, ref, useId, watch } from 'vue'
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
import LogBrowser from './LogBrowser.vue'

defineProps<{
  /** The part of the Logs screen (the router gives it). */
  section: string
}>()

const { t, locale } = useI18n()
const { number } = useFormat()
const uid = useId()
const { flights, browser } = useConfigurator()

/**
 * The heading of an open log.
 *
 * @param log the log, if it is in the list
 * @returns the words
 */
function headingOf(log: LocalLog | undefined): string {
  if (log === undefined) {
    return ''
  }

  return t(log.source === 'tlog' ? 'logs.flights.importedHeading' : 'logs.flights.heading', { id: log.id })
}

/** The place of the cursor shared by the charts (seconds from the start of the log). */
const cursor = ref<number | null>(null)

/** A log is being read, or what is drawn of it is being asked for: the backend does one read at a time. */
const busy = computed(() => flights.importing.value || flights.phase.value === 'reading' || flights.phase.value === 'loading')
const busyOrLoading = computed(() => busy.value || flights.loading.value)
const summary = computed(() => flights.summary.value)
const length = computed(() => (summary.value ? lengthOf(summary.value) : null))
const firstUs = computed(() => asNumber(summary.value?.firstUs ?? 0))
const spans = computed(() => (summary.value ? modeSpans(flights.modes.value, summary.value) : []))
const openLog = computed(() => flights.logs.value.find(log => log.key === flights.open.value))
const openId = computed(() => openLog.value?.id ?? 0)
const isTlog = computed(() => openLog.value?.source === 'tlog')
const detailTitle = computed(() => (isTlog.value ? headingOf(openLog.value) : t('logs.flights.heading', { id: openId.value })))
const report = computed(() => summary.value?.report)

/** What is damaged: for a recording the frames with a wrong checksum and the bytes skipped (unknown messages are not damage). */
const damage = computed(() => {
  const r = report.value

  return r === undefined ? summary.value?.problems ?? 0 : r.crcFailures + asNumber(r.bytesSkipped)
})
const vehiclesText = computed(() => {
  const { vehicles, sysid, compid } = { vehicles: 0, sysid: 0, compid: 0, ...report.value }

  return t('logs.flights.reportVehicles', { count: vehicles, system: sysid, component: compid })
})
const readText = computed(() => {
  const r = report.value
  if (r === undefined) {
    return ''
  }
  const skipped = number(asNumber(r.bytesSkipped), 0)

  const counts = { records: number(r.records, 0), skipped, crc: number(r.crcFailures, 0), unknown: number(r.unknown, 0) }

  return t('logs.flights.reportRead', counts)
})
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

/** The words for a verified copy and for one that is not, by who wrote the log. */
const STATE_KEYS: Readonly<Record<LocalLog['source'], readonly [string, string]>> = {
  dataflash: ['logs.flights.state.verified', 'logs.flights.state.unverified'],
  tlog: ['logs.flights.stateImported', 'logs.flights.stateImportedChanged'],
}

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
  const keys = STATE_KEYS[log.source]

  return t(log.summary.verified ? keys[0] : keys[1])
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

/**
 * What a log is called: its number, and for an imported recording that it is one.
 *
 * @param log the log
 * @returns the words
 */
function nameOf(log: LocalLog): string {
  return log.source === 'tlog' ? t('logs.flights.importedRow', { id: log.id }) : String(log.id)
}

const rows = computed(() => flights.logs.value.map(log => ({
  log,
  name: nameOf(log),
  openLabel: log.source === 'tlog' ? nameOf(log) : t('logs.flights.openLabel', { id: log.id }),
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

const busyText = computed(() => {
  const key = flights.phase.value === 'reading' ? 'logs.flights.reading' : 'logs.flights.loadingParts'

  return t(key, { id: openId.value })
})

/**
 * What the status says of a log that was just imported, when it is the one that is open.
 *
 * @returns the words, or null when the open log is not the one that was imported
 */
function importedNow(): string | null {
  const last = flights.imported.value
  if (last === null || last.key !== flights.open.value) {
    return null
  }

  return t(last.duplicate ? 'logs.flights.statusImportedAgain' : 'logs.flights.statusImported', { name: last.name })
}

/**
 * What the status says when nothing is open: an import or a read that was stopped, else nothing.
 *
 * @returns the words
 */
function idleStatus(): string {
  if (flights.importStopped.value) {
    return t('logs.flights.statusImportStopped')
  }

  return flights.stopped.value ? t('logs.flights.statusStopped') : ''
}

/** What the polite status says when nothing is being read: the log is open, it failed (and why), or it was stopped. */
const AFTER: Readonly<Record<string, () => string>> = {
  ready: () => (importedNow() ?? t('logs.flights.statusOpened', { id: openId.value })),
  failed: () => flights.error.value ?? '',
  idle: () => idleStatus(),
}

/** What the polite status says. It is always in the page, so a change of it is read out. */
const statusText = computed(() => (busy.value ? busyText.value : AFTER[flights.phase.value]?.() ?? ''))

/** The log that was opened last, to give the focus back to its button when the block that had it goes. */
let lastOpened = ''

/**
 * Opens a log once the questions the message browser has asked are answered (the backend reads one thing at a time).
 *
 * @param key the log
 */
async function openAfterTheBrowser(key: string): Promise<void> {
  await browser.settled()
  await flights.select(key)
}

/**
 * Opens a log, unless one is being read (the buttons say so with aria-disabled, which keeps the focus; the press is ignored).
 *
 * @param key the log
 */
function openByKey(key: string): void {
  if (!busy.value) {
    lastOpened = key
    void openAfterTheBrowser(key)
  }
}

/** Lets the user choose a log file and imports it, unless a read is going on (as for `openByKey`). */
function importFile(): void {
  if (!busyOrLoading.value) {
    void flights.importFile()
  }
}

/** Reads the list again, unless a read is going on (the same reason as for `openByKey`). */
function refreshList(): void {
  if (!busyOrLoading.value) {
    void flights.refresh()
  }
}

/** The heading of the open log, which takes the focus when the block with Stop goes (a script can give a heading the focus). */
const title = ref<HTMLElement | null>(null)

/**
 * The button that opened the log that was opened last.
 *
 * @returns the button, if it is there
 */
function openerOfLast(): HTMLElement | undefined {
  const tableRows = [...document.querySelectorAll<HTMLElement>('[data-key]')]

  return tableRows.find(item => item.dataset.key === lastOpened)?.querySelector<HTMLElement>('.flights-open') ?? undefined
}

/**
 * The Stop button goes when the read is through, fails or is stopped: the focus must not go with it. It goes to the heading of
 * the log when one is open, else back to the button that opened the log.
 *
 * @param stopHadFocus whether the Stop button had the focus before the page changed
 */
function giveFocusBack(stopHadFocus: boolean): void {
  if (stopHadFocus) {
    void nextTick(() => (flights.open.value === null ? openerOfLast() : title.value)?.focus())
  }
}

// Before the page is changed (flush: pre), while the Stop button is still there to be asked.
// Only a change after which Stop is gone: from reading to loading it stays, and keeps the focus.
watch(() => flights.phase.value, now => {
  if (now !== 'reading' && now !== 'loading') {
    giveFocusBack(document.activeElement?.id === 'flights-stop')
  }
}, { flush: 'pre' })

/**
 * Asks for the kinds of message of the log that was loaded, if it is verified (nothing is looked into one that is not).
 *
 * @param key the log
 */
function loadBrowser(key: string): void {
  if (flights.summary.value?.verified === true) {
    void browser.load(key)
  }
}

// The kinds of message of a log are asked for once it is loaded and verified (the backend does one pass at a time, and the
// browser's questions come after the charts'); a log that is closed or another one takes them away.
watch(() => [flights.phase.value, flights.open.value] as const, ([phase, key]) => {
  if (phase !== 'ready') {
    browser.clear()
    cursor.value = null
  } else if (key !== null) {
    loadBrowser(key)
  }
})

onMounted(() => {
  if (!flights.listed.value) {
    void flights.refresh()
  }
})

// The screen is kept alive while another part is shown, and logs may have been downloaded meanwhile (in "On the vehicle"): the
// list is read again whenever this part is shown again (not while it is being read, as on the first show).
onActivated(() => {
  if (flights.listed.value && !flights.loading.value && !busy.value) {
    void flights.refresh()
  }
})
</script>
