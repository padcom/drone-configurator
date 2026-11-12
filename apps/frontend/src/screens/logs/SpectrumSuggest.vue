
<template>
  <section id="spectrum-suggest" class="spectrum-suggest" :aria-labelledby="`${uid}-title`">
    <h4 :id="`${uid}-title`">{{ t('logs.spectrum.suggest.title') }}</h4>
    <p class="muted">{{ t('logs.spectrum.suggest.source', source) }}</p>
    <Banner v-if="!kind.same" id="spectrum-different" tone="warn">
      {{ t('logs.spectrum.suggest.different', { log: kind.log, vehicle: kind.vehicle }) }}
    </Banner>
    <table class="logs-table spectrum-suggestions">
      <caption class="visually-hidden">{{ t('logs.spectrum.suggest.title') }}</caption>
      <thead>
        <tr>
          <th scope="col">{{ t('logs.spectrum.suggest.parameter') }}</th>
          <th scope="col">{{ t('logs.spectrum.suggest.now') }}</th>
          <th scope="col">{{ t('logs.spectrum.suggest.value') }}</th>
          <th scope="col">{{ t('logs.spectrum.suggest.because') }}</th>
          <th scope="col">{{ t('logs.spectrum.suggest.takes') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :data-id="row.id">
          <th scope="row">{{ row.id }}</th>
          <td>{{ row.now }}</td>
          <td class="spectrum-suggested">{{ row.to }}</td>
          <td>{{ row.because }}</td>
          <td class="spectrum-takes">{{ row.takes }}</td>
        </tr>
      </tbody>
    </table>
    <p class="muted">{{ t('logs.spectrum.suggest.note') }}</p>
    <p id="spectrum-reboot-note" class="muted">{{ t('logs.spectrum.suggest.rebootNote') }}</p>
    <p v-if="trackingKnown" id="spectrum-mode-ref" class="muted">{{ t('logs.spectrum.suggest.modeRef', tracking) }}</p>
    <Banner v-if="tracking.ref > 0" id="spectrum-tracking" tone="warn">{{ t('logs.spectrum.suggest.tracking') }}</Banner>
    <p v-if="!connected" id="spectrum-suggest-offline" class="muted">{{ t('logs.spectrum.suggest.offline') }}</p>
    <!-- Not while the vehicle is armed, or may be: INS_HNTCH_FREQ and BW act on the running filter. -->
    <p v-else-if="mayBeArmed" id="spectrum-suggest-armed" class="muted">{{ t('logs.spectrum.suggest.armed') }}</p>
    <!-- Values from a log of another kind of vehicle (or of one that cannot be told) need a second press that names both. -->
    <SecondPress
      v-else-if="!kind.same"
      id="spectrum-add"
      :label="t('logs.spectrum.suggest.add', { count: rows.length })"
      :confirm-label="t('logs.spectrum.suggest.addDifferent', { log: kind.log, vehicle: kind.vehicle })"
      @confirm="add()"
    />
    <Button v-else id="spectrum-add" @click="add()">{{ t('logs.spectrum.suggest.add', { count: rows.length }) }}</Button>
    <p id="spectrum-suggest-status" class="muted" role="status">{{ addedText }}</p>
  </section>
</template>

<script setup lang="ts">
// The values of the harmonic notch that the peak of a spectrum suggests, with where each comes from: the log, the sensor, the
// peak.
// Nothing is written: "Add to the changes" puts them in the list of parameter changes (the review), where they are written
// after one
// question, each read back. Values from a log of another kind of vehicle than the one connected (or of one that is not known)
// need a
// second press that names both.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import SecondPress from '@/components/ui/SecondPress.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { SpectrumPeak } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import { armedOf } from '@/lib/app/armed'
import { sameKind, suggestNotch } from '@/lib/logs/spectrum'
import { showNumber } from '@/lib/params/paramValue'

/** The tracking parameters of the notch (HarmonicNotchFilter.cpp: _MODE 0 fixed to 5, _REF 0 disables the tracking). */
const NOTCH_MODE = 'INS_HNTCH_MODE'
const NOTCH_REF = 'INS_HNTCH_REF'

const props = defineProps<{
  /** The peak the values come from. */
  peak: SpectrumPeak
  /** What says where it comes from: the log, the sensor and the unit of the amplitude. */
  source: { log: number, sensor: string, instance: number, unit: string }
  /** The firmware text of the log. */
  firmware: string | undefined
}>()

const { t } = useI18n()
const { number } = useFormat()
const uid = useId()
const { parameters, staged, fields } = useConfigurator()

const connected = computed(() => fields.connection.value.state === 'connected')
const mayBeArmed = computed(() => armedOf(fields.telemetry.value) !== false)

/**
 * Whether the vehicle has a parameter.
 *
 * @param id the parameter
 * @returns true if it is in the list
 */
function has(id: string): boolean {
  return parameters.params.value.some(param => param.id === id)
}

/**
 * What the vehicle has for a parameter, as a number (0 when it has none).
 *
 * @param id the parameter
 * @returns the value
 */
function valueOf(id: string): number {
  return parameters.params.value.find(param => param.id === id)?.value ?? 0
}

/** The tracking the vehicle's notch has, when it has the parameters: the mode and the reference (0 when it has none). */
const tracking = computed(() => ({ mode: valueOf(NOTCH_MODE), ref: valueOf(NOTCH_REF) }))
const trackingKnown = computed(() => has(NOTCH_MODE) || has(NOTCH_REF))
const kind = computed(() => sameKind(props.firmware, fields.connection.value.vehicle?.type))
const suggestions = computed(() => suggestNotch(props.peak))
const added = ref<number | null>(null)

/**
 * What the vehicle has for a parameter, written; a dash when it has no such parameter.
 *
 * @param id the parameter
 * @returns the value
 */
function nowOf(id: string): string {
  const value = parameters.params.value.find(param => param.id === id)?.value

  return value === undefined ? '—' : showNumber(value)
}

/** The numbers the reasons are written with. */
const whyValues = computed(() => ({ hz: number(props.peak.hz, 0), count: props.peak.harmonics.length }))

const rows = computed(() => suggestions.value.map(s => ({
  id: s.id,
  to: s.to,
  now: nowOf(s.id),
  takes: t(s.reboot ? 'logs.spectrum.suggest.afterReboot' : 'logs.spectrum.suggest.atOnce'),
  because: t(`logs.spectrum.suggest.why.${s.because}`, whyValues.value, props.peak.harmonics.length),
})))

const addedText = computed(() => {
  const count = added.value

  return count === null ? '' : t('logs.spectrum.suggest.added', { count }, count)
})

/** Queues the values (nothing is written); a value the vehicle has already is not a change. */
function add(): void {
  added.value = staged.stage(suggestions.value.map(s => ({ id: s.id, to: s.to })))
}
</script>
