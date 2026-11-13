<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.compass') }}</h3>
      <p class="muted">{{ t('setup.compass.summary') }}</p>
      <CalibrationNotice />
      <RebootBanner :show="kept" />
      <div class="setup-actions">
        <Button id="setup-compass-start" variant="primary" :disabled="!canStart" @click="start">
          {{ t('setup.compass.start') }}
        </Button>
        <Button id="setup-compass-cancel" :disabled="!running" @click="calibration.cancel()">
          {{ t('setup.compass.cancel') }}
        </Button>
        <Toggle id="setup-compass-autosave" v-model="autosave" :disabled="!canStart">{{ t('setup.compass.autosave') }}</Toggle>
      </div>
      <p class="muted">{{ t('setup.compass.autosaveHelp') }}</p>
      <p id="setup-compass-status" class="setup-status" role="status">{{ status }}</p>
      <ul v-if="compasses.length > 0" class="setup-compasses">
        <li v-for="c in compasses" :key="c.id" class="setup-compass" :data-compass="c.id">
          <div class="setup-compass-head">
            <strong>{{ t('setup.compass.number', { n: c.id + 1 }) }}</strong>
            <span class="muted" :data-status="c.status">{{ statusName(c.status) }}</span>
            <span class="setup-compass-percent">{{ c.percent }} %</span>
          </div>
          <ProgressBar :value="c.percent / 100" :label="t('setup.compass.progress', { n: c.id + 1 })" />
          <div
            class="setup-sphere"
            role="img"
            :aria-label="t('setup.compass.sphere', { lit: litCount(c.mask), all: SPHERE_SECTIONS })"
          >
            <span v-for="(on, i) in litSections(c.mask)" :key="i" class="setup-section" :class="{ lit: on }" />
          </div>
          <dl v-if="c.report" class="setup-report" :data-report="c.id">
            <dt>{{ t('setup.compass.fitness') }}</dt>
            <dd>{{ shown(c.report.fitness) }}</dd>
            <dt>{{ t('setup.compass.offsets') }}</dt>
            <dd>{{ c.report.offsets.map(shown).join(', ') }}</dd>
            <dt>{{ t('setup.compass.oldOffsets') }}</dt>
            <dd>{{ before.get(c.id)?.map(shown).join(', ') ?? '—' }}</dd>
            <dt>{{ t('setup.compass.diagonals') }}</dt>
            <dd>{{ c.report.diagonals.map(shown).join(', ') }}</dd>
            <dt>{{ t('setup.compass.orientation') }}</dt>
            <dd :data-orientation="c.id">
              {{ orientationName(c.report.oldOrientation) }} → {{ orientationName(c.report.newOrientation) }}
            </dd>
          </dl>
          <p v-if="c.report && foundTurned(c)" class="setup-warn" role="note" :data-turned="c.id">
            {{ autoRot >= 2 ? t('setup.compass.turnedKept') : t('setup.compass.turnedNotKept') }}
          </p>
        </li>
      </ul>
      <div v-if="reviewing" class="setup-actions">
        <Button id="setup-compass-accept" variant="flight" :disabled="!canAccept" @click="calibration.accept()">
          {{ t('setup.compass.accept') }}
        </Button>
        <Button id="setup-compass-discard" @click="calibration.cancel()">{{ t('setup.compass.discard') }}</Button>
      </div>
      <p v-if="reviewing" class="muted">{{ t('setup.compass.acceptHelp') }}</p>
      <p v-if="kept" id="setup-compass-kept" class="muted">{{ t('setup.compass.kept') }}</p>
      <h4 class="setup-label">{{ t('setup.compass.order') }}</h4>
      <p class="muted">{{ t('setup.compass.orderHelp') }}</p>
      <ol class="setup-order">
        <li v-for="(id, place) in COMPASS_ORDER_PARAMS" :key="id" class="setup-order-row" :data-place="place + 1">
          <span>{{ t('setup.compass.place', { n: place + 1 }) }}</span>
          <span class="muted">{{ deviceName(panel.value(id)) }}</span>
          <Button :disabled="!canMove(place, -1)" :aria-label="t('setup.compass.up', { n: place + 1 })" @click="move(place, -1)">
            ↑
          </Button>
          <Button :disabled="!canMove(place, 1)" :aria-label="t('setup.compass.down', { n: place + 1 })" @click="move(place, 1)">
            ↓
          </Button>
        </li>
      </ol>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-compass" only-present />
  </section>
</template>

<script setup lang="ts">
// The compass: the vehicle is turned round, every way, while the VEHICLE says how far each compass is (a percent, and the
// sections of the sphere around the vehicle that have samples: the real completion mask). When every compass has reported, the
// results WAIT: the report (fitness, the new offsets beside the old ones, the orientation before and after) is shown and nothing
// is kept until the user accepts, explicitly, the compasses that succeeded; cancelling or leaving the page drops them (and tells
// the vehicle to stop). The vehicle's own "autosave" is off unless the user turns it on. An accepted calibration replaces the old
// offsets (they stay in the parameter review's initial values, for a revert) and needs a reboot. A compass found turned is shown
// before accepting: with COMPASS_AUTO_ROT 2 or more, accepting keeps the new orientation. The order of the compasses
// (COMPASS_PRIO*_ID) is written like any Setup parameter, after the one question, and not while a calibration runs.
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import CalibrationNotice from '@/components/setup/CalibrationNotice.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import RebootBanner from '@/components/setup/RebootBanner.vue'
import Button from '@/components/ui/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import {
  COMPASS_AUTO_ROT,
  COMPASS_ORDER_PARAMS,
  COMPASS_PARAMS,
  SPHERE_SECTIONS,
  anySucceeded,
  foundTurned,
  litCount,
  litSections,
  moved,
  offsetParams,
  shown,
} from '@/lib/setup/calibration'
import { decodeDeviceId, hexOf } from '@/lib/setup/deviceId'
import { ORIENTATIONS, nameIn } from '@/lib/setup/frame'

const { t, te } = useI18n()
const uid = useId()
const handle = useConfigurator()
const { calibration } = handle
const { state } = calibration
const panel = useParamPanel(COMPASS_PARAMS, handle)
const mine = computed(() => state.value.kind === 'compass')
const running = computed(() => calibration.running.value && mine.value)
const compasses = computed(() => (mine.value ? state.value.compasses ?? [] : []))
const reviewing = computed(() => mine.value && state.value.state === 'review')
const idle = computed(() => !calibration.running.value && !calibration.calling.value)
const canStart = computed(() => calibration.blocked.value === null && idle.value)
const canAccept = computed(() => reviewing.value && !calibration.calling.value && anySucceeded(compasses.value))
const kept = computed(() => mine.value && calibration.result.value?.outcome === 'success')
/** The vehicle's own "autosave" is the user's choice: off unless turned on. */
const autosave = ref(false)
/** COMPASS_AUTO_ROT: 2 or more, and a calibration that finds a compass turned keeps its new orientation. */
const autoRot = computed(() => handle.parameters.params.value.find(param => param.id === COMPASS_AUTO_ROT)?.value ?? 0)
/** The offsets the vehicle had when the calibration began: an accepted one replaces them (the initial values keep them). */
const before = ref(new Map<number, number[]>())
/** The ids in the places now (what is chosen here, else the vehicle's). */
const ids = computed(() => COMPASS_ORDER_PARAMS.map(id => panel.value(id) ?? 0))
/** What the page says of where the calibration is, in words. */
const status = computed(() => {
  const key = mine.value ? state.value.state : 'idle'

  return key === 'finished' ? '' : t(`setup.compass.${key}`)
})

/**
 * The words for a compass's status (ArduPilot's name, for one that has none).
 *
 * @param name ArduPilot's status name
 * @returns the words
 */
function statusName(name: string): string {
  return te(`setup.compass.status.${name}`) ? t(`setup.compass.status.${name}`) : name
}

/**
 * The name of an orientation (ArduPilot's rotation number).
 *
 * @param value the number
 * @returns its name, `None` for 0, or the number
 */
function orientationName(value: number): string {
  return value === 0 ? t('setup.compass.noRotation') : nameIn(ORIENTATIONS, value) ?? String(value)
}

/**
 * What a device id is, as text.
 *
 * @param id the id a priority parameter holds
 * @returns the bus and the address, or "no compass" for an empty place
 */
function deviceName(id: number | null): string {
  const device = id === null ? null : decodeDeviceId(id)

  return device === null ? t('setup.compass.emptyPlace') : `${device.bus} ${device.instance} · ${hexOf(device.address)}`
}

/**
 * Whether a place and the one it would swap with both exist and hold a compass.
 *
 * @param place the place, 0 based
 * @param direction -1 up, 1 down
 * @returns true if both do
 */
function bothHold(place: number, direction: -1 | 1): boolean {
  return moved(ids.value, place, direction) !== null && ids.value[place] !== 0 && ids.value[place + direction] !== 0
}

/**
 * Whether the compass in a place can move that way now: not while a calibration runs or the panel cannot write, there is a
 * place to go to, and both places hold a compass.
 *
 * @param place the place, 0 based
 * @param direction -1 up, 1 down
 * @returns true if it can
 */
function canMove(place: number, direction: -1 | 1): boolean {
  return panel.blocked.value === null && !calibration.running.value && bothHold(place, direction)
}

/**
 * Moves the compass in a place, by choosing the swapped ids (nothing is written until the panel's write).
 *
 * @param place the place, 0 based
 * @param direction -1 up, 1 down
 */
function move(place: number, direction: -1 | 1): void {
  const next = moved(ids.value, place, direction)
  if (next !== null) {
    COMPASS_ORDER_PARAMS.forEach((id, i) => panel.set(id, next[i] as number))
  }
}

/** Starts: remembers the offsets the vehicle has (the old ones), then asks for the calibration. */
async function start(): Promise<void> {
  const old = new Map<number, number[]>()
  for (const index of [0, 1, 2]) {
    const values = offsetParams(index).map(id => handle.parameters.params.value.find(param => param.id === id)?.value)
    if (values.every((value): value is number => value !== undefined)) {
      old.set(index, values)
    }
  }
  before.value = old
  await calibration.start('compass', { autosave: autosave.value })
}

/** Leaving the page cancels what runs (and drops results not accepted): nothing is left calibrating, or waiting, unseen. */
function leave(): void {
  if (calibration.running.value && mine.value) {
    void calibration.cancel()
  }
}

onMounted(() => void calibration.refresh())
onDeactivated(leave)
onBeforeUnmount(leave)
</script>
