<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.radio') }}</h3>
      <p class="muted">{{ t('setup.radio.summary') }}</p>
      <CalibrationNotice />
      <div class="setup-actions">
        <Button id="setup-radio-start" variant="primary" :disabled="!canStart" @click="calibration.start('radio')">
          {{ t('setup.radio.start') }}
        </Button>
        <Button id="setup-radio-finish" variant="flight" :disabled="!canFinish" @click="calibration.finish()">
          {{ t('setup.radio.finish') }}
        </Button>
        <Button id="setup-radio-cancel" :disabled="!running" @click="calibration.cancel()">{{ t('setup.radio.cancel') }}</Button>
      </div>
      <p id="setup-radio-status" class="setup-status" role="status">{{ status }}</p>
      <p v-if="glitches > 0" id="setup-radio-glitches" class="muted">{{ t('setup.radio.glitches', { count: glitches }) }}</p>
      <p v-if="staged !== null" id="setup-radio-staged" class="muted">
        {{ staged === 0 ? t('setup.radio.nothingMoved') : t('setup.radio.staged', { count: staged }) }}
      </p>
      <EmptyState
        v-if="rows.length === 0"
        :title="t('setup.radio.noChannels')"
        :help="t('setup.radio.noChannelsHelp')"
        :level="4"
      />
      <ul v-else class="setup-channels">
        <li v-for="row in rows" :key="row.n" class="setup-channel-row" :data-channel="row.n">
          <span class="setup-channel-name">{{ row.name }}</span>
          <ProgressBar :value="row.fraction" :label="row.name" />
          <span class="setup-channel-pulse">{{ row.pulse }}</span>
          <span class="muted setup-channel-range">{{ row.range }}</span>
        </li>
      </ul>
      <p v-if="rssi !== null" class="muted">{{ t('setup.radio.rssi', { percent: rssi }) }}</p>
      <h4 class="setup-label">{{ t('setup.radio.aux') }}</h4>
      <p class="muted">{{ t('setup.radio.auxHelp') }}</p>
      <ol class="setup-aux">
        <li v-for="n in auxChannels" :key="n" class="setup-aux-row" :data-aux="n">
          <span>{{ t('setup.radio.channel', { n }) }}</span>
          <EnumField
            :model-value="panel.value(paramsOf(n).option) ?? 0"
            :options="optionNames(n)"
            :label="t('setup.radio.function', { n })"
            :disabled="panel.blocked.value !== null || calibration.running.value"
            @update:model-value="panel.set(paramsOf(n).option, $event)"
          />
        </li>
      </ol>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-radio" :hold="calibration.running.value" only-changed />
  </section>
</template>

<script setup lang="ts">
// The radio: every channel of the receiver as a bar that follows the transmitter live (the `rc` telemetry group: a pulse
// outside 800 to 2200 µs is not a reading and never moves a bar), the calibration, and what each aux switch does. The
// calibration is the backend's: it sets the vehicle's RC calibration flag, captures the least and the greatest pulse of each
// channel while the user moves the sticks and switches, and ends only when the user presses Done (never by itself). What it
// captured is then CHOSEN here, not written: RCn_MIN and RCn_MAX of the channels that moved and RCn_TRIM of roll, pitch and
// yaw, to be written with the page's one question like any Setup parameter (refused while the vehicle is armed or may be).
// Cancelling, leaving the page, losing the link and the vehicle arming all end the calibration, and nothing is chosen from
// one that did not end with Done.
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from '@/components/fields/EnumField.vue'
import CalibrationNotice from '@/components/setup/CalibrationNotice.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import type { CalibrationRadio } from '@/generated/app'
import { RADIO_PARAMS, RCMAP_PARAMS, endedWithDone, fractionOf, paramsOf, plannedWrites, roleOf, spanOf } from '@/lib/setup/radio'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const { calibration } = handle
const { state } = calibration
const panel = useParamPanel(RADIO_PARAMS, handle)
const mine = computed(() => state.value.kind === 'radio')
const running = computed(() => calibration.running.value && mine.value)
const idle = computed(() => !calibration.running.value && !calibration.calling.value)
const canStart = computed(() => calibration.blocked.value === null && idle.value)
const taken = computed(() => state.value.radio?.readings ?? 0)
const live = computed(() => running.value && state.value.state === 'running' && !calibration.calling.value)
const canFinish = computed(() => live.value && taken.value > 0)
const captured = computed(() => (mine.value ? state.value.radio : undefined))
const glitches = computed(() => captured.value?.glitches ?? 0)
/** How many values the calibration that just ended chose (null: none ended well while this page looked). */
const staged = ref<number | null>(null)
const channels = computed(() => handle.vehicle.telemetry.value?.rc?.channels ?? [])
const rssi = computed(() => handle.vehicle.telemetry.value?.rc?.rssi ?? null)
/** The auxiliary channels the vehicle has a function parameter for (channel 5 on), with the receiver's channels, at least 8. */
const auxChannels = computed(() => {
  const last = Math.max(8, channels.value.length)
  const all = Array.from({ length: last - 4 }, (_unused, i) => i + 5)

  return all.filter(n => !panel.missing.value.includes(paramsOf(n).option))
})
/** What the page says of where the calibration is, in words. */
const status = computed(() => {
  const key = mine.value ? state.value.state : 'idle'

  return key === 'finished' ? '' : t(`setup.radio.${key}`)
})

/**
 * What the vehicle has for a parameter.
 *
 * @param id the parameter
 * @returns its value, or null when the vehicle has none
 */
function vehicleValue(id: string): number | null {
  return handle.parameters.params.value.find(param => param.id === id)?.value ?? null
}

/** Which channel each stick is on (RCMAP_ROLL, _PITCH, _THROTTLE, _YAW): read here, never written from this page. */
const mapped = computed(() => RCMAP_PARAMS.map(vehicleValue))

/**
 * What a channel's row shows.
 *
 * @param n the channel, 1 based
 * @param pulse its pulse now (µs; 0: none)
 * @returns the name, the place in its range, the pulse and the range in words
 */
function rowOf(n: number, pulse: number): { n: number, name: string, fraction: number, pulse: string, range: string } {
  const role = roleOf(n, mapped.value)
  const own = paramsOf(n)
  const [min, max] = spanOf(captured.value, n - 1, [panel.value(own.min), panel.value(own.max)])

  return {
    n,
    name: role === 'aux' ? t('setup.radio.channel', { n }) : t('setup.radio.stick', { n, role: t(`setup.radio.role.${role}`) }),
    fraction: fractionOf(pulse, min, max),
    pulse: pulse > 0 ? t('setup.radio.pulse', { us: pulse }) : '—',
    range: `${min}–${max}`,
  }
}

const rows = computed(() => channels.value.map((pulse, index) => rowOf(index + 1, pulse)))

/**
 * The named functions a channel's switch can have: the parameter metadata's names for it (empty without metadata: the field then
 * shows the number, and says so).
 *
 * @param n the channel, 1 based
 * @returns the options, by number
 */
function optionNames(n: number): { value: number, label: string }[] {
  const values = handle.metadata.metadata.value.get(paramsOf(n).option)?.values ?? {}

  return Object.entries(values).map(([value, label]) => ({ value: Number(value), label }))
}

/**
 * Chooses what a calibration that ended with Done found (nothing is written: the panel's write does that).
 *
 * @param radio what the calibration captured
 */
function choose(radio: CalibrationRadio): void {
  const planned = plannedWrites(radio, id => !panel.missing.value.includes(id))
  planned.forEach(p => panel.set(p.id, p.value))
  staged.value = planned.length
}

/** Whether a calibration ran while this page looked: only what the user saw end is chosen from, not an old result on return. */
const watched = ref(false)
watch(running, now => {
  watched.value = watched.value || now
})

watch(() => calibration.result.value, result => {
  const { radio } = state.value
  const seen = watched.value
  watched.value = false

  if (seen && radio !== undefined && endedWithDone(result)) {
    choose(radio)
  } else {
    staged.value = null
  }
})

/** Leaving the page cancels what runs: the vehicle's RC calibration flag is cleared, and nothing is left calibrating unseen. */
function leave(): void {
  if (calibration.running.value && mine.value) {
    void calibration.cancel()
  }
}

onMounted(() => void calibration.refresh())
onDeactivated(leave)
onBeforeUnmount(leave)
</script>
