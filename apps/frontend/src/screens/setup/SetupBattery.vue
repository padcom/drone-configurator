<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.battery') }}</h3>
      <p class="muted">{{ t('setup.battery.summary') }}</p>
      <div class="setup-tabs" role="group" :aria-label="t('setup.battery.which')">
        <Button
          v-for="(_prefix, i) in BATTERY_PREFIXES"
          :id="`setup-battery-tab-${i + 1}`"
          :key="i"
          :aria-pressed="tab === i"
          :disabled="panels[i]?.missing.value.length === 4"
          @click="tab = i"
        >
          {{ t('setup.battery.tab', { n: i + 1 }) }}
        </Button>
      </div>
      <div v-if="tab === 0" class="setup-tiles">
        <div v-for="tile in tiles" :key="tile.id" class="setup-tile" :data-tile="tile.id">
          <span class="setup-label">{{ tile.label }}</span>
          <strong>{{ tile.value }}</strong>
        </div>
      </div>
      <p v-else class="muted">{{ t('setup.battery.noLiveSecond') }}</p>
      <div class="setup-fields">
        <label :for="`${uid}-monitor`">{{ t('setup.battery.monitor') }}</label>
        <EnumField
          :model-value="panel.value(ids[0] ?? '') ?? 0"
          :options="monitors"
          :label="t('setup.battery.monitor')"
          :disabled="locked(ids[0] ?? '')"
          @update:model-value="panel.set(ids[0] ?? '', $event)"
        />
        <label :for="`${uid}-capacity`">{{ t('setup.battery.capacity') }}</label>
        <TextInput
          :id="`${uid}-capacity`"
          :model-value="String(panel.value(ids[1] ?? '') ?? '')"
          :disabled="locked(ids[1] ?? '')"
          @update:model-value="setCapacity"
        />
      </div>
      <template v-if="tab === 0">
        <p v-if="hasVoltage || hasCurrent" class="muted">{{ t('setup.battery.offsetNote') }}</p>
        <p v-if="!hasVoltage" id="setup-battery-novoltage" class="muted">{{ t('setup.battery.noMultiplier') }}</p>
        <BatteryCalibration
          v-else
          kind="voltage"
          :param="ids[2] ?? ''"
          :current="panel.vehicleValue(ids[2] ?? '')"
          :shown="shownVoltage"
          :disabled="panel.blocked.value !== null"
          @use="panel.set(ids[2] ?? '', $event)"
        />
        <BatteryCalibration
          v-if="hasCurrent"
          kind="current"
          :param="ids[3] ?? ''"
          :current="panel.vehicleValue(ids[3] ?? '')"
          :shown="shownCurrent"
          :disabled="panel.blocked.value !== null"
          @use="panel.set(ids[3] ?? '', $event)"
        />
      </template>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-battery">
      <p class="muted">{{ t('setup.battery.thresholds') }}</p>
    </PanelAside>
  </section>
</template>

<script setup lang="ts">
// Battery: the monitor, the capacity, and the calibration of the voltage and the current. Each is a number that the page proposes
// from a meter and what the vehicle shows, and the user writes (nothing is written until "Write and verify", never while the
// vehicle is armed or may be). The low and critical voltages and their actions are on the Failsafes page. What the vehicle shows
// live is the first battery's (the telemetry has no second one), so the second battery has its monitor and capacity and no
// calibration here.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import BatteryCalibration from '@/components/setup/BatteryCalibration.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import Button from '@/components/ui/Button.vue'
import TextInput from '@/components/ui/TextInput.vue'
import EnumField from '@/components/fields/EnumField.vue'
import type { BatteryGroup } from '@/generated/app'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { BATTERY_PREFIXES, CURRENT_MONITORS, MONITORS, VOLTAGE_MONITORS, batteryParams, parseAmount } from '@/lib/setup/battery'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const panels = BATTERY_PREFIXES.map((_prefix, i) => useParamPanel(batteryParams(i), handle))
const tab = ref(0)
const panel = computed(() => panels[tab.value] ?? panels[0]!)
const ids = computed(() => batteryParams(tab.value))
const monitors = MONITORS.map(monitor => ({ value: monitor.value, label: t(`setup.monitor.${monitor.name}`) }))
const battery = computed(() => handle.fields.telemetry.value?.battery)
const groupVoltage = computed(() => battery.value?.voltage)
const flatVoltage = computed(() => handle.fields.telemetry.value?.batteryVoltage)
const shownVoltage = computed(() => groupVoltage.value ?? flatVoltage.value ?? null)
const shownCurrent = computed(() => battery.value?.current ?? null)
/** The monitor the vehicle has (not a draft that was not written: what it does is what it is set to). */
const monitor = computed(() => panel.value.vehicleValue(ids.value[0] ?? ''))
const hasVoltage = computed(() => VOLTAGE_MONITORS.includes(monitor.value ?? -1))
const hasCurrent = computed(() => CURRENT_MONITORS.includes(monitor.value ?? -1))

/**
 * The charge remaining, in words.
 *
 * @param group the battery group
 * @returns a percent, or a dash when the vehicle says none
 */
function remainingOf(group: BatteryGroup | undefined): string {
  return group?.remaining === undefined ? '–' : `${group.remaining} %`
}

/**
 * The live tiles of the first battery: only what the vehicle says (a missing reading is a dash, not a zero).
 *
 * @param value what it says
 * @param unit the unit
 * @returns the text
 */
function shown(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? '–' : `${value.toFixed(2)} ${unit}`
}

const tiles = computed(() => [
  { id: 'voltage', label: t('setup.battery.tileVoltage'), value: shown(shownVoltage.value, 'V') },
  { id: 'current', label: t('setup.battery.tileCurrent'), value: shown(shownCurrent.value, 'A') },
  { id: 'remaining', label: t('setup.battery.tileRemaining'), value: remainingOf(battery.value) },
])

/**
 * Whether a field cannot be used now: nothing can be written, or the vehicle does not have the parameter.
 *
 * @param id the parameter
 * @returns true if it is off
 */
function locked(id: string): boolean {
  return panel.value.blocked.value !== null || panel.value.missing.value.includes(id)
}

/**
 * The capacity as typed: a whole number of mAh that is not negative.
 *
 * @param text what was typed
 */
function setCapacity(text: string): void {
  const capacity = parseAmount(text)
  if (capacity !== null && Number.isInteger(capacity)) {
    panel.value.set(ids.value[1] ?? '', capacity)
  }
}
</script>
