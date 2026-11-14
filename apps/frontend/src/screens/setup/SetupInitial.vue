<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.initial') }}</h3>
      <p class="muted">{{ t('setup.initial.summary') }}</p>
      <div class="setup-tabs" role="group" :aria-label="t('setup.initial.size')">
        <Button
          v-for="inches in PROP_SIZES"
          :id="`setup-initial-size-${inches}`"
          :key="inches"
          :aria-pressed="size === inches"
          @click="size = inches"
        >
          {{ t('setup.initial.inches', { n: inches }) }}
        </Button>
      </div>
      <div class="setup-fields">
        <label :for="`${uid}-cells`">{{ t('setup.initial.cells') }}</label>
        <TextInput
          :id="`${uid}-cells`"
          v-model="cellsText"
          :invalid="cellsText.trim() !== '' && cells === null"
          :aria-describedby="`${uid}-cells-help`"
        />
      </div>
      <p :id="`${uid}-cells-help`" class="muted">{{ t('setup.initial.cellsHelp', { max: MAX_CELLS }) }}</p>
      <p v-if="size === null" id="setup-initial-pick" class="muted">{{ t('setup.initial.pick') }}</p>
      <table v-else id="setup-initial-table" class="setup-sensors">
        <thead>
          <tr>
            <th scope="col">{{ t('setup.initial.parameter') }}</th>
            <th scope="col">{{ t('setup.initial.now') }}</th>
            <th scope="col">{{ t('setup.initial.suggested') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" :data-param="row.id">
            <th scope="row">{{ row.id }}</th>
            <td>{{ row.now }}</td>
            <td :class="{ muted: row.value === null || row.missing }">{{ row.suggested }}</td>
          </tr>
        </tbody>
      </table>
      <div class="setup-calibrate-row">
        <Button id="setup-initial-use" :disabled="!usable" @click="use">{{ t('setup.initial.use') }}</Button>
      </div>
      <p id="setup-initial-source" class="muted">{{ t('setup.initial.source') }}</p>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-initial" only-changed />
  </section>
</template>

<script setup lang="ts">
// Initial tune: the starting values ArduPilot publishes for a propeller size and a battery (lib/setup/initialTune.ts has the page
// they are from and the numbers). The user says the size (one of the four the page gives) and the cells; the table shows each
// parameter's value now and the one suggested, or why there is none (the page gives none for this size, the cells are not
// said, or the vehicle does not have the parameter). "Use these values" only CHOOSES them here: they are written like every
// Setup change, from the list on the side, through the one question, never while the vehicle is armed or may be. Nothing is
// computed from what the vehicle has now.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelAside from '@/components/setup/PanelAside.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { showNumber } from '@/lib/params/paramValue'
import {
  INITIAL_TUNE_IDS, MAX_CELLS, PROP_SIZES, type PropSize, type Suggestion, initialTune, parseCells,
} from '@/lib/setup/initialTune'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const panel = useParamPanel(INITIAL_TUNE_IDS, handle)
const size = ref<PropSize | null>(null)
const cellsText = ref('')
const cells = computed(() => parseCells(cellsText.value))
const suggestions = computed(() => size.value === null ? [] : initialTune(size.value, cells.value))

/**
 * What a row says in the suggested column: the value, or why there is none.
 *
 * @param item the suggestion
 * @param missing whether the vehicle does not have the parameter
 * @returns the text
 */
function suggestedOf(item: Suggestion, missing: boolean): string {
  if (missing) {
    return t('setup.initial.notOnVehicle')
  }

  return item.value === null ? t(`setup.initial.why.${item.why ?? 'notGiven'}`) : showNumber(item.value)
}

/**
 * The value the vehicle has, as text.
 *
 * @param id the parameter
 * @returns the value, or a dash for a vehicle that does not have the parameter
 */
function nowOf(id: string): string {
  const now = panel.vehicleValue(id)

  return now === null ? '–' : showNumber(now)
}

const rows = computed(() => suggestions.value.map(item => {
  const missing = panel.missing.value.includes(item.id)

  return { id: item.id, value: item.value, missing, now: nowOf(item.id), suggested: suggestedOf(item, missing) }
}))

/** The parameters that have a value to choose: the vehicle has them and the page gives one. */
const choosable = computed(() => rows.value.filter(row => row.value !== null && !row.missing))
const usable = computed(() => choosable.value.length > 0 && panel.blocked.value === null && !panel.writing.value)

/** Chooses the suggested values in the panel (nothing is sent: the list on the side is what is written). */
function use(): void {
  for (const row of choosable.value) {
    if (row.value !== null) {
      panel.set(row.id, row.value)
    }
  }
}
</script>
