<template>
  <section class="logs-vehicle" :data-section="section" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('logs.vehicle.title') }}</h3>
    <!-- What the last look at the downloaded logs on this computer did (it removes by the preferences in Settings). -->
    <p v-if="housekeepingText" id="logs-housekeeping" class="muted">{{ housekeepingText }}</p>
    <EmptyState
      v-if="connection.state !== 'connected'"
      :title="t('logs.vehicle.offline.title')"
      :help="t('logs.vehicle.offline.help')"
      :level="4"
    />
    <!-- A backend that has no logs to offer (yet): the words of the placeholder, and no controls that could not work. -->
    <EmptyState
      v-else-if="logs.unavailable.value"
      :title="t('logs.empty.vehicle.title')"
      :help="t('logs.empty.vehicle.help')"
      :level="4"
    />
    <template v-else>
      <Banner v-if="reason" id="logs-blocked" tone="warn">{{ reason }}</Banner>
      <Banner v-if="logs.error.value" id="logs-error" tone="error">{{ logs.error.value }}</Banner>
      <div class="logs-toolbar">
        <Button id="logs-refresh" :disabled="logs.loading.value || logs.running.value" @click="logs.refresh()">
          {{ t('logs.vehicle.refresh') }}
        </Button>
        <Button id="logs-select-new" :disabled="logs.running.value || !hasNew" @click="logs.selectNew()">
          {{ t('logs.vehicle.selectNew') }}
        </Button>
        <Button :disabled="logs.running.value || chosen === 0" @click="logs.clearSelection()">
          {{ t('logs.vehicle.selectNone') }}
        </Button>
      </div>
      <p class="logs-used muted">{{ t('logs.vehicle.used', { count: logs.logs.value.length, size: size(used) }) }}</p>
      <p v-if="logs.loading.value && !logs.listed.value" class="muted">{{ t('logs.vehicle.loading') }}</p>
      <p v-else-if="logs.listed.value && logs.logs.value.length === 0" class="muted">{{ t('logs.vehicle.none') }}</p>
      <table v-else-if="logs.logs.value.length > 0" class="logs-table">
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">{{ t('logs.vehicle.column.select') }}</span></th>
            <th scope="col">{{ t('logs.vehicle.column.id') }}</th>
            <th scope="col">{{ t('logs.vehicle.column.modified') }}</th>
            <th scope="col">{{ t('logs.vehicle.column.size') }}</th>
            <th scope="col">{{ t('logs.vehicle.column.state') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.log.id" :class="row.state">
            <td>
              <Checkbox
                :model-value="logs.selected.value.includes(row.log.id)"
                :disabled="row.log.downloaded || row.log.noChecksum === true || logs.running.value"
                :aria-label="t('logs.vehicle.select', { id: row.log.id })"
                @update:model-value="logs.toggle(row.log.id)"
              />
            </td>
            <th scope="row">{{ row.log.id }}</th>
            <td>{{ row.date }}</td>
            <td>{{ size(row.log.size) }}</td>
            <td class="logs-state">
              <span class="logs-state-text">{{ row.text }}</span>
              <ProgressBar
                v-if="row.state === 'downloading'"
                :value="row.percent / 100"
                :label="t('logs.vehicle.progress', { id: row.log.id })"
              />
              <span v-if="row.resumed" class="muted logs-resumed">{{ row.resumed }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="undated" class="muted logs-nodate">{{ t('logs.vehicle.noDateNote') }}</p>
      <p v-if="logs.source.value === 'mavlink'" id="logs-protocol" class="muted">{{ t('logs.vehicle.viaProtocol') }}</p>
      <div class="logs-actions">
        <Button v-if="logs.running.value" id="logs-cancel" @click="logs.cancel()">{{ t('logs.vehicle.cancel') }}</Button>
        <Button v-else id="logs-download" :disabled="!canDownload" @click="logs.download()">
          {{ t('logs.vehicle.download', { count: chosen }) }}
        </Button>
      </div>
    </template>
    <!-- What the last download or erase came to: always in the page, so that the words are read out when they change. -->
    <p id="logs-outcome" class="logs-outcome" role="status">{{ outcome }}</p>
    <!-- Erasing is last in the page, and later in the work: the second press says what will happen, the note says what stays. -->
    <div v-if="connection.state === 'connected' && !logs.unavailable.value" class="logs-erase">
      <SecondPress
        id="logs-erase"
        :label="t('logs.vehicle.erase.label')"
        :confirm-label="t('logs.vehicle.erase.confirm', { count: logs.logs.value.length })"
        :disabled="!canEraseNow"
        :aria-describedby="`${uid}-erase-note`"
        @arm="logs.refresh()"
        @confirm="logs.erase()"
      />
      <p :id="`${uid}-erase-note`" class="muted">{{ eraseNote }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
// "On the vehicle", the vehicle's own logs: a table of them (number, date, size, state), a selection, a download of the ones
// selected (a bar for the log being fetched, the others queued; a log that went on from what an earlier try fetched says
// so), and the erase. Safety comes first: nothing is downloaded on its own, nothing is downloaded or erased while the vehicle
// is armed or not known to be disarmed (the page says why, and the buttons are off), and erasing is a second press that says
// exactly what will happen: it takes EVERY log on the vehicle, so it is off until each has a copy here that was checked (the page
// says how many have not). A vehicle listed over the log protocol has no checksum, so none is checked there. How much
// the vehicle holds is the sum of the sizes listed: the vehicle does not say how much room it has, so no total is shown.
import { computed, onMounted, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import Checkbox from '@/components/ui/Checkbox.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import SecondPress from '@/components/ui/SecondPress.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'
import type { VehicleLog } from '@/generated/app'
import { madeAt, notChecked, percentOf, sizeText, stateOf, undownloadedIds, usedBytes } from '@/lib/logs/vehicleLogs'

defineProps<{
  /** The part of the Logs screen (the router gives it). */
  section: string
}>()

const { t, locale } = useI18n()
const { number } = useFormat()

/**
 * A size in the language of the interface.
 *
 * @param bytes the size
 * @returns the text
 */
function size(bytes: number): string {
  return sizeText(bytes, number)
}
const uid = useId()
const { logs, fields, housekeeping } = useConfigurator()

/** What the last housekeeping did, in words (nothing before one). */
const housekeepingText = computed(() => {
  const done = housekeeping.last.value
  if (done === null) {
    return ''
  }
  const line = t('housekeeping.line', { removed: done.removedCount, kept: done.kept })
  const over = done.overCap ? t('housekeeping.lineOver') : ''
  const unverified = done.unverified > 0 ? t('housekeeping.lineUnverified', { count: done.unverified }) : ''

  return `${line}${over}${unverified}`
})
const { connection } = fields

const used = computed(() => usedBytes(logs.logs.value))
const hasNew = computed(() => undownloadedIds(logs.logs.value).length > 0)
const chosen = computed(() => logs.selected.value.length)
const undated = computed(() => logs.logs.value.some(log => madeAt(log) === null))
const missing = computed(() => notChecked(logs.logs.value))
/** An erase takes every log on the vehicle: it needs one, and a checked copy of each. */
const canEraseNow = computed(() => {
  const listed = logs.logs.value.length

  return logs.blocked.value === null && logs.canErase.value && listed > 0 && missing.value === 0
})
const canDownload = computed(() => logs.blocked.value === null && chosen.value > 0)
const reason = computed(() => (logs.blocked.value === null ? '' : t(`logs.vehicle.blocked.${logs.blocked.value}`)))
const eraseNote = computed(() => {
  if (!logs.canErase.value) {
    return t('logs.vehicle.erase.unavailable')
  }

  if (logs.logs.value.length === 0) {
    return t('logs.vehicle.erase.nothing')
  }

  return missing.value > 0
    ? t('logs.vehicle.erase.notAll', { missing: missing.value, total: logs.logs.value.length })
    : t('logs.vehicle.erase.note', { count: logs.logs.value.length })
})

/**
 * What a row says of the log's state.
 *
 * @param state how the log is doing
 * @param percent how far, when it is being fetched
 * @returns the words
 */
function stateText(state: string, percent: number): string {
  return t(`logs.vehicle.state.${state}`, { percent })
}

/**
 * When a log was made, in the language of the interface.
 *
 * @param log the log
 * @returns the date and time, or the words for none
 */
function dateText(log: VehicleLog): string {
  return madeAt(log)?.toLocaleString(locale.value) ?? t('logs.vehicle.noDate')
}

/**
 * Where a download of a log went on from, in words; nothing for one that began at the start.
 *
 * @param from the bytes that an earlier try had fetched
 * @returns the words, or an empty text
 */
function resumedText(from: number | undefined): string {
  return from === undefined ? '' : t('logs.vehicle.resumed', { size: size(from) })
}

const rows = computed(() => logs.logs.value.map(log => {
  const progress = logs.progress.value[log.id]
  const state = stateOf(log, progress)
  const percent = percentOf(progress)

  return {
    log,
    state,
    percent,
    date: dateText(log),
    text: stateText(state, percent),
    resumed: resumedText(progress?.resumedFrom),
  }
}))

const outcome = computed(() => {
  const done = logs.outcome.value
  if (done === null) {
    return ''
  }

  return done.kind === 'erased'
    ? t('logs.vehicle.outcome.erased', { erased: done.erased })
    : t(done.stopped ? 'logs.vehicle.outcome.stopped' : 'logs.vehicle.outcome.downloaded', { count: done.count })
})

/** Reads the list when a vehicle is connected and it has not been read (listing is harmless; nothing is downloaded). */
function listWhenConnected(): void {
  if (connection.value.state === 'connected' && !logs.listed.value && !logs.unavailable.value) {
    void logs.refresh()
  }
}

onMounted(listWhenConnected)
// Also when the list was forgotten (another vehicle took the place of the one listed) with the link still connected.
watch(() => [connection.value.state, logs.listed.value], listWhenConnected)
</script>
