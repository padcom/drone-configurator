<template>
  <section id="presets" class="compare presets" :aria-label="t('presets.region')">
    <header class="compare-head">
      <div>
        <h3>{{ t('presets.title') }}</h3>
        <p v-if="list" id="presets-source">{{ refLine(list, t) }}</p>
        <p v-if="list && freshness" id="presets-freshness">{{ freshness }}</p>
      </div>
      <div class="presets-head-actions">
        <Button id="presets-refresh" :disabled="presets.loading.value" @click="presets.refresh()">
          {{ t('presets.refresh') }}
        </Button>
        <Button id="close-presets" @click="presets.close()">{{ t('presets.close') }}</Button>
      </div>
    </header>
    <p v-if="presets.loading.value" class="compare-loading" role="status">{{ t('presets.loading') }}</p>
    <p v-if="presets.error.value" id="presets-error" class="compare-error" role="alert">{{ presets.error.value }}</p>
    <div v-if="list" class="presets-body">
      <div class="presets-list">
        <div class="compare-filters">
          <label class="compare-field">
            <span>{{ t('presets.search') }}</span>
            <TextInput id="presets-search" v-model="search" mono autocomplete="off" />
          </label>
          <p id="presets-count" class="presets-count" role="status">{{ countText }}</p>
        </div>
        <div class="compare-table">
          <DataTable
            v-model:selected="selected"
            :rows="list.presets"
            :columns="columns"
            :row-key="rowKey"
            :filter="shows"
            :row-attrs="rowAttrs"
            :label="t('presets.table')"
            :help="t('presets.help')"
          />
        </div>
      </div>
      <div class="presets-preview" :aria-label="t('presets.contents')" role="region">
        <template v-if="presets.selected.value">
          <h4 id="preset-name">{{ presetName(presets.selected.value) }}</h4>
          <p class="presets-path">{{ presets.selected.value }}</p>
          <p v-if="presets.fetching.value" class="compare-loading" role="status">{{ t('presets.fetching') }}</p>
          <p v-if="presets.presetError.value" id="preset-error" class="compare-error" role="alert">
            {{ presets.presetError.value }}
          </p>
          <!-- The text as ArduPilot publishes it; it takes the focus, so that a long one scrolls from the keyboard. -->
          <pre
            v-if="preset"
            id="preset-text"
            class="presets-text"
            tabindex="0"
            :aria-label="t('presets.text')"
          >{{ preset.text }}</pre>
        </template>
        <p v-else class="presets-pick">{{ t('presets.pick') }}</p>
        <div class="review-actions">
          <p class="review-status" :class="{ warn: armed }" :role="armed ? 'alert' : 'status'">{{ applyText }}</p>
          <Button id="preset-review" variant="primary" :disabled="!presets.canReview()" @click="presets.review()">
            {{ t('presets.review') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PresetEntry } from '@/generated/app'
import Button from '@/components/ui/Button.vue'
import DataTable from '@/components/ui/DataTable.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { freshnessLine, presetFolder, presetName, presetShows, refLine } from '@/lib/params/framePresets'
import type { Column } from '@/lib/ui/dataTable'
import { focusAsked, takeFocus } from '@/composables/useFocusIntent'
import { useConfigurator } from '@/composables/useConfigurator'

// ArduPilot's frame presets (#41), in the list's place on the Parameters screen: where the list came from (the vehicle's firmware
// tag, or master and why), a search, the presets in the kit's table (one tab stop; the arrows move the selection), the selected
// one's contents as ArduPilot publishes them, and "Review and apply". A preset changes how the vehicle flies: it goes to the
// review (every change shown, those that can be made ticked) only while the vehicle is known to be disarmed, and the review
// writes it after a confirmation, one by one and read back. Nothing is written from here.
const { t } = useI18n()
const { presets, snapshots } = useConfigurator()
const list = computed(() => presets.list.value)
const preset = computed(() => presets.preset.value)
const freshness = computed(() => (list.value ? freshnessLine(list.value, t) : ''))
const armed = computed(() => snapshots.mayBeArmed())
const search = computed({ get: () => presets.search.value, set: (value: string) => void (presets.search.value = value) })
const selected = computed({
  get: () => presets.selected.value,
  set: (path: string | number | null | undefined) => void presets.select(typeof path === 'string' ? path : null),
})
const shows = computed(() => {
  const query = presets.search.value

  return (entry: PresetEntry) => presetShows(entry, query)
})
const countText = computed(() => {
  const all = list.value?.presets ?? []

  return t('presets.count', { shown: all.filter(shows.value).length, all: all.length })
})
const applyText = computed(() => (armed.value ? t('presets.armed') : t('presets.safety')))

const columns = computed<Column<PresetEntry>[]>(() => [
  {
    id: 'name', header: t('presets.column.name'), width: 260, rowHeader: true, sortable: true,
    value: entry => presetName(entry.path),
  },
  { id: 'folder', header: t('presets.column.folder'), width: 140, sortable: true, value: entry => presetFolder(entry.path) },
  { id: 'size', header: t('presets.column.size'), width: 100, sortable: true, align: 'end', value: entry => entry.size },
])

/**
 * What names a row.
 *
 * @param entry the preset
 * @returns its path
 */
const rowKey = (entry: PresetEntry) => entry.path

/**
 * A row's attributes, for the page and its tests to find it by.
 *
 * @param entry the preset
 * @returns the attributes
 */
const rowAttrs = (entry: PresetEntry) => ({ 'data-path': entry.path })

// The palette's command asks for the focus in the search (`presets.search`): it goes there once the list is there (to Close when
// the list could not be had), whether the presets were shown just now or were open already.
const wantsFocus = shallowRef(false)

/** Takes a fresh ask for the focus, if there is one. */
function claimFocus(): void {
  wantsFocus.value = wantsFocus.value || takeFocus('presets.search')
}

/**
 * Puts the focus on an element of the page, if it is there.
 *
 * @param id its id
 */
function focusOn(id: string): void {
  document.getElementById(id)?.focus()
}

/** Puts the focus in the search, or on Close, once the list has come or failed. */
async function giveFocus(): Promise<void> {
  if (!wantsFocus.value || presets.loading.value) {
    return
  }
  wantsFocus.value = false
  await nextTick()
  focusOn(list.value ? 'presets-search' : 'close-presets')
}

watch(focusAsked, claimFocus)
watch([wantsFocus, () => presets.loading.value], giveFocus)
onMounted(claimFocus)
</script>
