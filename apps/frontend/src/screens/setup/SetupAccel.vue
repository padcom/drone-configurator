<template>
  <section class="setup-page-body single" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.accel') }}</h3>
      <p class="muted">{{ t('setup.accel.summary') }}</p>
      <CalibrationNotice />
      <ol class="setup-positions" :aria-label="t('setup.accel.positions')">
        <li
          v-for="p in ACCEL_POSITIONS"
          :key="p.position"
          class="setup-position"
          :class="{ current: asked === p.position, placed: placed.includes(p.position) }"
          :data-position="p.position"
          :aria-current="asked === p.position ? 'step' : undefined"
        >
          <span class="setup-position-no">{{ p.position }}</span>
          <span class="setup-position-name">{{ t(`setup.accel.position.${p.key}`) }}</span>
          <span class="setup-mark" :class="mark(p.position).state" aria-hidden="true">{{ mark(p.position).glyph }}</span>
          <span class="visually-hidden">{{ t(`setup.accel.state.${mark(p.position).state}`) }}</span>
        </li>
      </ol>
      <p id="setup-accel-status" class="setup-status" role="status">{{ status }}</p>
      <div class="setup-actions">
        <Button id="setup-accel-start" variant="primary" :disabled="!canStart" @click="calibration.start('accel')">
          {{ t('setup.accel.start') }}
        </Button>
        <Button id="setup-accel-level" :disabled="!canStart" @click="calibration.start('level')">
          {{ t('setup.accel.level') }}
        </Button>
        <Button id="setup-accel-placed" variant="flight" :disabled="!canConfirm" @click="calibration.confirm(asked)">
          {{ t('setup.accel.placed') }}
        </Button>
        <Button id="setup-accel-cancel" :disabled="!calibration.running.value" @click="calibration.cancel()">
          {{ t('setup.accel.cancel') }}
        </Button>
      </div>
      <p class="muted">{{ t('setup.accel.cancelNote') }}</p>
      <template v-if="trusted">
        <h4 class="setup-label">{{ t('setup.accel.values') }}</h4>
        <dl id="setup-accel-values" class="setup-facts-list">
          <template v-for="id in ACCEL_PARAMS" :key="id">
            <dt>{{ id }}</dt>
            <dd>{{ valueOf(id) }}</dd>
          </template>
        </dl>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
// The accelerometer: the vehicle is placed in six positions (level, left, right, nose down, nose up, on its back), one after the
// other. The VEHICLE asks for each (the position it is waiting for is the highlighted one) and the user says "Placed" when the
// vehicle is in it and still; the vehicle takes the sample, and asks for the next. The gyros are calibrated first, so the vehicle
// must be still from the start. "Level only" sets the level of the board with the vehicle on level ground. Only the vehicle's own
// success is a success: the offsets are shown after it, never as a result of the last position; a failure is shown as a failure,
// with the vehicle's own words. The calibration is cancelled when the page is left (nothing is left running on its own), and
// refused while the vehicle is armed or not known to be disarmed (here and in the backend).
import { computed, onBeforeUnmount, onDeactivated, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import CalibrationNotice from '@/components/setup/CalibrationNotice.vue'
import Button from '@/components/ui/Button.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { ACCEL_PARAMS, ACCEL_POSITIONS, accelPhase, positionKey, positionMark, shown } from '@/lib/setup/calibration'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const { calibration } = handle
const { state } = calibration
const mine = computed(() => ['accel', 'level'].includes(state.value.kind ?? ''))
const accel = computed(() => (mine.value ? state.value.accel : undefined))
const asked = computed(() => accel.value?.position ?? 0)
const placed = computed(() => accel.value?.placed ?? [])
const confirming = computed(() => accel.value?.confirming === true)
const phase = computed(() => accelPhase(mine.value ? state.value.state : 'idle', asked.value, confirming.value))
const idle = computed(() => !calibration.running.value && !calibration.calling.value)
const canStart = computed(() => calibration.blocked.value === null && idle.value)
const canConfirm = computed(() => phase.value === 'place' && !calibration.calling.value)
/** The offsets are trusted only when the vehicle said the accelerometer calibration succeeded. */
const trusted = computed(() => state.value.kind === 'accel' && calibration.result.value?.outcome === 'success')
const params = computed(() => new Map(handle.parameters.params.value.map(param => [param.id, param.value])))
/** What the page says of where the calibration is, in words. */
const status = computed(() => {
  const where = t(`setup.accel.position.${positionKey(asked.value)}`)

  return phase.value === '' ? '' : t(`setup.accel.${phase.value}`, { where })
})

/**
 * The mark of a position.
 *
 * @param position the position
 * @returns its state and glyph
 */
function mark(position: number): ReturnType<typeof positionMark> {
  return positionMark(position, asked.value, placed.value)
}

/**
 * A parameter of the vehicle as text.
 *
 * @param id the parameter
 * @returns its value, or a dash when the vehicle has none
 */
function valueOf(id: string): string {
  const value = params.value.get(id)

  return value === undefined ? '—' : shown(value)
}

/** Leaving the page cancels what runs: a calibration that nobody watches is not left going. */
function leave(): void {
  if (calibration.running.value && mine.value) {
    void calibration.cancel()
  }
}

onMounted(() => void calibration.refresh())
onDeactivated(leave)
onBeforeUnmount(leave)
</script>
