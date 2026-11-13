
<template>
  <section id="log-browser" class="log-browser" :aria-labelledby="`${uid}-title`">
    <h4 :id="`${uid}-title`" class="log-browser-title">{{ t('logs.browser.title') }}</h4>
    <p id="browser-status" class="visually-hidden" role="status">{{ statusText }}</p>
    <Banner v-if="browser.error.value" id="browser-error" tone="error">{{ browser.error.value }}</Banner>
    <p v-if="browser.types.value.length === 0" class="muted">{{ emptyText }}</p>
    <template v-else>
      <p v-if="browser.more.value > 0" id="browser-more" class="muted">
        {{ t('logs.browser.more', { count: browser.more.value }) }}
      </p>
      <div class="browser-pickers">
        <label class="browser-pick">
          <span>{{ t('logs.browser.kind') }}</span>
          <Select id="browser-kind" :model-value="browser.message.value" :options="kindOptions" @update:model-value="choose" />
        </label>
        <label v-if="instanceOptions.length > 1" class="browser-pick">
          <span>{{ t('logs.browser.instance', { field: instanceField }) }}</span>
          <Select
            id="browser-instance"
            :model-value="String(browser.instance.value)"
            :options="instanceOptions"
            @update:model-value="pickInstance"
          />
        </label>
      </div>
      <p v-if="browser.message.value === ''" class="muted">{{ t('logs.browser.pick') }}</p>
      <p v-else-if="cursor === null" id="browser-cursor-hint" class="muted">{{ t('logs.browser.moveCursor') }}</p>
      <p v-else-if="browser.at.value && !browser.at.value.found" id="browser-nothing" class="muted">
        {{ t('logs.browser.nothingYet', { kind: browser.message.value }) }}
      </p>
      <table v-else-if="row" class="logs-table browser-fields">
        <caption class="visually-hidden">{{ t('logs.browser.fieldsAt', { kind: browser.message.value, time: clock }) }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('logs.browser.field') }}</th>
            <th scope="col">{{ t('logs.browser.value') }}</th>
            <th scope="col"><span class="visually-hidden">{{ t('logs.browser.graph') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in fields" :key="field.name" :data-field="field.name">
            <th scope="row">{{ field.name }}</th>
            <td class="browser-value">{{ field.text }}</td>
            <td>
              <Button
                v-if="field.graphable"
                class="browser-graph"
                :aria-label="t('logs.browser.graphLabel', { field: field.name })"
                @click="graph(field.name)"
              >
                {{ t('logs.browser.graph') }}
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="row" class="muted browser-when">{{ t('logs.browser.writtenAt', { time: whenText }) }}</p>
      <LineChart
        v-if="graphed"
        v-model:cursor="cursor"
        :title="graphedTitle"
        :series="graphedSeries"
        :format-x="clockOf"
        :empty-text="t('logs.browser.notNumbers')"
      />
    </template>
    <div class="browser-export">
      <h5 class="browser-export-title">{{ t('logs.export.title') }}</h5>
      <div class="browser-export-buttons">
        <Button id="export-csv" :aria-disabled="csvDisabled ? 'true' : undefined" @click="startExport('csv')">
          {{ t('logs.export.csv', { kind: browser.message.value || '…' }) }}
        </Button>
        <Button id="export-gpx" @click="startExport('gpx')">{{ t('logs.export.gpx') }}</Button>
        <Button id="export-kml" @click="startExport('kml')">{{ t('logs.export.kml') }}</Button>
      </div>
      <p id="export-status" class="browser-export-status" role="status">{{ exportText }}</p>
      <SecondPress
        v-if="exporting.kind === 'exists'"
        id="export-replace"
        :label="t('logs.export.replace')"
        :confirm-label="t('logs.export.replaceConfirm', { name: baseName })"
        @confirm="browser.replace()"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
// The message browser of the open flight log: the kinds of message the log has, the fields of one kind as they were at the cursor
// (the last message of each instance at or before it, with the time it was written, never a later one), a field pressed to be
// charted, and the export of the log (CSV of the chosen kind, GPX and KML of the GPS track) to a file the user chooses. A file
// that is there is not replaced by the first press: the page names it and asks for a second press.
import { computed, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LineChart, { type LineSeries } from '@/components/charts/LineChart.vue'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import SecondPress from '@/components/ui/SecondPress.vue'
import Select from '@/components/ui/Select.vue'
import { type ExportFormat, timeAt } from '@/composables/useLogBrowser'
import { useConfigurator } from '@/composables/useConfigurator'
import { useFormat } from '@/i18n/useFormat'
import { clockOf } from '@/lib/logs/localLogs'
import { baseNameOf, exportWords, fieldRows } from '@/lib/logs/messageBrowser'

const props = defineProps<{
  /** The time of the log's first message (microseconds). */
  firstUs: number
}>()

const cursor = defineModel<number | null>('cursor', { default: null })

const { t } = useI18n()
const { number } = useFormat()
const uid = useId()
const { browser } = useConfigurator()

const exporting = computed(() => browser.exporting.value)
const graphed = computed(() => browser.graphed.value)
const kindType = computed(() => browser.types.value.find(type => type.name === browser.message.value))
const instanceField = computed(() => kindType.value?.instanceField ?? '')
const kindOptions = computed(() => [
  { value: '', label: t('logs.browser.pickOption') },
  ...browser.types.value.map(type => ({ value: type.name, label: `${type.name} (${number(type.count, 0)})` })),
])
const instanceOptions = computed(() => (browser.at.value?.rows ?? [])
  .filter(row => row.instance !== undefined)
  .map(row => ({ value: String(row.instance), label: String(row.instance) })))
const row = computed(() => browser.at.value?.rows.find(r => r.instance === undefined || r.instance === browser.instance.value))
const fields = computed(() => (row.value && kindType.value ? fieldRows(row.value, kindType.value, number) : []))
const clock = computed(() => clockOf(cursor.value ?? 0))
const whenText = computed(() => clockOf((Number(row.value?.timeUs ?? 0) - props.firstUs) / 1e6))
const csvDisabled = computed(() => browser.message.value === '')
const baseName = computed(() => (exporting.value.kind === 'exists' ? baseNameOf(exporting.value.path) : ''))
const exportText = computed(() => exportWords(exporting.value, t, number))
const emptyText = computed(() => t(browser.busy.value ? 'logs.browser.loading' : 'logs.browser.none'))
const statusText = computed(() => (browser.busy.value ? t('logs.browser.asking') : ''))
const graphedTitle = computed(() => {
  const g = graphed.value

  return g === null ? '' : `${g.message}.${g.field}${g.unit === undefined ? '' : `, ${g.unit}`}`
})
const graphedSeries = computed<LineSeries[]>(() => {
  const g = graphed.value

  return g === null ? [] : [{ id: 'graphed', label: g.field, tone: 'accent', points: g.points }]
})

/**
 * Chooses a kind of message.
 *
 * @param message its name ('' for none)
 */
function choose(message: string): void {
  browser.choose(message)
}

/**
 * Chooses an instance.
 *
 * @param value its number as text
 */
function pickInstance(value: string): void {
  browser.instance.value = Number(value)
}

/**
 * Charts a field.
 *
 * @param name the field
 */
function graph(name: string): void {
  void browser.graph(name, props.firstUs)
}

/**
 * Starts an export (the first press: the file is not replaced).
 *
 * @param format the format
 */
function startExport(format: ExportFormat): void {
  if (format !== 'csv' || !csvDisabled.value) {
    void browser.exportAs(format)
  }
}

// The place of the cursor along the log is the time the fields are asked for (only the latest place is asked while it moves).
watch(cursor, place => {
  if (place !== null) {
    browser.moveTo(timeAt(place, props.firstUs))
  }
}, { immediate: true })
</script>
