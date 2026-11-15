<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.initial') }}</h3>
      <p class="muted">{{ t('setup.initial.summary') }}</p>
      <div class="setup-fields">
        <label for="setup-initial-size">{{ t('setup.initial.size') }}</label>
        <TextInput
          id="setup-initial-size"
          v-model="sizeText"
          :invalid="sizeText.trim() !== '' && size === null"
          :aria-describedby="`${uid}-size-help`"
        />
      </div>
      <p :id="`${uid}-size-help`" class="muted">{{ t('setup.initial.sizeHelp', { min: MIN_SIZE, max: MAX_SIZE }) }}</p>
      <div class="setup-tabs" role="group" :aria-label="t('setup.initial.chemistry')">
        <Button
          v-for="kind in CHEMISTRIES"
          :id="`setup-initial-chemistry-${kind.id}`"
          :key="kind.id"
          :aria-pressed="chemistry.id === kind.id"
          @click="chemistry = kind"
        >
          {{ kind.id }}
        </Button>
      </div>
      <div class="setup-fields">
        <label for="setup-initial-cells">{{ t('setup.initial.cells') }}</label>
        <TextInput
          id="setup-initial-cells"
          v-model="cellsText"
          :invalid="cellsText.trim() !== '' && cells === null"
          :aria-describedby="`${uid}-cells-help`"
        />
      </div>
      <p :id="`${uid}-cells-help`" class="muted">
        {{ t('setup.initial.cellsHelp', { max: MAX_CELLS, full: chemistry.cellMax, empty: chemistry.cellMin }) }}
      </p>
      <table id="setup-initial-table" class="setup-sensors">
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
            <td :class="{ muted: row.value === null }">{{ row.suggested }}</td>
          </tr>
        </tbody>
      </table>
      <div class="setup-calibrate-row">
        <Button id="setup-initial-use" :disabled="!usable" @click="use">{{ t('setup.initial.use') }}</Button>
      </div>
      <p id="setup-initial-source" class="muted">{{ t('setup.initial.source') }}</p>
      <p id="setup-initial-after" class="muted">{{ t('setup.initial.after') }}</p>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-initial" only-changed />
  </section>
</template>

<script setup lang="ts">
// Initial tune: the starting values Mission Planner's "Initial Parameter Setup" calculates for a propeller size and a battery
// (lib/setup/initialTune.ts has the formulas and the lines of its source they are from). The user says the size, the kind of
// battery and the cells; the table shows each parameter's value now and the one suggested, or why there is none (the size or
// the cells are not said, or the vehicle does not have the parameter). "Use these values" only CHOOSES them here: they are
// written like every Setup change, from the list on the side, through the one question, never while the vehicle is armed or may
// be. Nothing is computed from what the vehicle has now, except which unit its acceleration limits are in (the parameter it has
// says it).
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelAside from '@/components/setup/PanelAside.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { showNumber } from '@/lib/params/paramValue'
import {
  CENTI_DEGREE_IDS, CHEMISTRIES, DEGREE_IDS, INITIAL_TUNE_IDS, MAX_CELLS, MAX_SIZE, MIN_SIZE, type Chemistry, type Suggestion,
  beyondRange, initialTune, parseCells, parseSize,
} from '@/lib/setup/initialTune'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const panel = useParamPanel(INITIAL_TUNE_IDS, handle)
const sizeText = ref('')
const cellsText = ref('')
const chemistry = ref<Chemistry>(CHEMISTRIES[0] as Chemistry)
const size = computed(() => parseSize(sizeText.value))
const cells = computed(() => parseCells(cellsText.value))
const suggestions = computed(() => initialTune({ size: size.value, cells: cells.value, chemistry: chemistry.value }))

/** Whether the vehicle has the acceleration limits in centi-degrees (the older names): Mission Planner then writes those. */
const centiDegrees = computed(() => !panel.missing.value.includes('ATC_ACCEL_P_MAX'))

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
  if (beyondRange(item.id, panel.vehicleValue(item.id))) {
    return t('setup.initial.why.aboveRange')
  }

  return item.value === null ? t(`setup.initial.why.${String(item.why)}`) : showNumber(item.value)
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

/**
 * Whether a parameter is in the table: of the two units of the acceleration limits, only the one the vehicle uses.
 *
 * @param id the parameter
 * @returns false for the limits of the other unit
 */
function shown(id: string): boolean {
  return centiDegrees.value ? !DEGREE_IDS.includes(id) : !CENTI_DEGREE_IDS.includes(id)
}

const rows = computed(() => suggestions.value.filter(item => shown(item.id)).map(item => {
  const missing = panel.missing.value.includes(item.id)
  // (a value that is not offered is shown as the reason, not as a number)
  const offered = item.value !== null && !missing && !beyondRange(item.id, panel.vehicleValue(item.id))

  return { id: item.id, value: offered ? item.value : null, missing, now: nowOf(item.id), suggested: suggestedOf(item, missing) }
}))

/** The parameters that have a value to choose: the vehicle has them, there is a value and it is in the vehicle's range. */
const choosable = computed(() => rows.value.filter(row => row.value !== null))

// What was chosen is what the table shows now: a change of the size, the battery or the cells, or a list that is read again,
// puts the choices back to what the vehicle has (else a value chosen for another size would be written under a table with none).
watch([size, cells, chemistry, () => handle.parameters.list.value], () => panel.revert())
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
