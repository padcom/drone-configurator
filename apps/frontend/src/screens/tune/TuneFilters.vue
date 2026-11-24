<template>
  <TunePage :tune="tune" :title="t('tune.section.filters')" id-prefix="tune-filters">
    <p class="muted">{{ t('tune.filters.summary') }}</p>
    <!-- Its line is always kept, so the controls below stay put (#562); the arming is announced by the Tune screen. -->
    <Banner id="tune-filters-armed" tone="warn" :empty="!armedText" :room="[t('tune.filters.armed')]" role="presentation">
      {{ armedText }}
    </Banner>
    <p v-if="tracking" id="tune-filters-tracking" class="muted">{{ t('tune.filters.tracking') }}</p>
    <Banner v-if="misses" id="tune-filters-misses" tone="warn">
      {{ t('tune.filters.misses', { log: openId, peaks: peaksText, bands: bandsText }) }}
    </Banner>
    <section v-for="group in GROUPS" :key="group" class="tune-block" :aria-labelledby="`${uid}-${group}`">
      <h4 :id="`${uid}-${group}`" class="setup-label">{{ t(`tune.group.${group}`) }}</h4>
      <template v-for="param in present(group)" :key="param.id">
        <TuneSlider
          v-if="param.kind === 'slider'"
          :label="t(`tune.name.${param.id}`)"
          :ids="[param.id]"
          :param="param"
          :panel="panel"
        />
        <TuneChoice
          v-else-if="param.kind === 'choice'"
          :label="t(`tune.name.${param.id}`)"
          :param="param"
          :options="CHOICES[param.id] ?? []"
          :panel="panel"
        />
        <TuneBits v-else :label="t(`tune.name.${param.id}`)" :param="param" :bits="bitsOf(param.id)" :panel="panel" />
      </template>
    </section>
    <p v-if="missing.length > 0" id="tune-filters-missing" class="muted">
      {{ t('tune.missing', { names: missing.join(', ') }) }}
    </p>
  </TunePage>
</template>

<script setup lang="ts">
// The filters: the gyro filter and the first harmonic notch. The parameters that take effect in flight (the gyro filter's cutoff,
// the notch's centre, bandwidth and attenuation) are written like the rest of Tune, with the hold and the banner when the vehicle
// is armed. The ones the firmware reads only when it starts (the notch's switch, tracking mode, reference, harmonics and options)
// are written while the vehicle is disarmed only: they are off while it is armed, and the backend refuses them too. This is the
// ONE way to write the notch while armed; the Spectrum tab's suggestions stay in the list of changes and are refused armed. When
// a log's spectrum is open in Spectrum and the notch (as it is chosen) takes out none of its peaks, the page warns.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import TuneBits from '@/components/tune/TuneBits.vue'
import TuneChoice from '@/components/tune/TuneChoice.vue'
import TunePage from '@/components/tune/TunePage.vue'
import TuneSlider from '@/components/tune/TuneSlider.vue'
import Banner from '@/components/ui/Banner.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useTunePanel } from '@/composables/useTunePanel'
import { useFormat } from '@/i18n/useFormat'
import { notchBands } from '@/lib/logs/spectrum'
import {
  type Choice, NOTCH_ENABLE, NOTCH_HARMONICS, NOTCH_MODES, NOTCH_OPTIONS, type NamedBit, notchMissesPeaks, peakFrequencies,
} from '@/lib/tune/filters'
import { TUNE_PARAMS, type TuneGroup, type TuneParam, tuneGroup } from '@/lib/tune/table'

const GROUPS: TuneGroup[] = ['gyro', 'notch']
const CHOICES: Record<string, Choice[]> = { INS_HNTCH_ENABLE: NOTCH_ENABLE, INS_HNTCH_MODE: NOTCH_MODES }
const HARMONICS: NamedBit[] = Array.from({ length: NOTCH_HARMONICS }, (_, bit) => ({ bit, name: '' }))

const { t } = useI18n()
const uid = useId()
const { number } = useFormat()
const handle = useConfigurator()
const { spectrum, flights } = handle
const ids = TUNE_PARAMS.filter(param => GROUPS.includes(param.group)).map(param => param.id)
const tune = useTunePanel(ids, handle)
const { panel, missing } = tune
/** What the banner says while the vehicle is armed, nothing otherwise (its line is kept either way). */
const armedText = computed(() => (panel.armed.value ? t('tune.filters.armed') : ''))

/**
 * The parameters of a group that the vehicle has.
 *
 * @param group the group
 * @returns the parameters, in the order of the page
 */
function present(group: TuneGroup): TuneParam[] {
  return tuneGroup(group).filter(param => !missing.value.includes(param.id))
}

/**
 * The bits of a mask, named.
 *
 * @param id the parameter
 * @returns the harmonics (1st to 16th) or the options
 */
function bitsOf(id: string): NamedBit[] {
  const harmonic = ({ bit }: NamedBit): NamedBit => ({ bit, name: t('tune.filters.harmonic', { n: bit + 1 }) })

  return id === 'INS_HNTCH_OPTS' ? NOTCH_OPTIONS : HARMONICS.map(harmonic)
}

/**
 * The value chosen for a parameter (what is queued counts).
 *
 * @param id the parameter
 * @returns its value, 0 when the vehicle has none
 */
function chosen(id: string): number {
  return panel.value(id) ?? 0
}

/** The notch as it is chosen. */
const setting = computed(() => ({
  freq: chosen('INS_HNTCH_FREQ'),
  bandwidth: chosen('INS_HNTCH_BW'),
  attenuation: chosen('INS_HNTCH_ATT'),
  harmonics: chosen('INS_HNTCH_HMNCS'),
}))
const peak = computed(() => spectrum.spectrum.value?.peak)
const nyquist = computed(() => (spectrum.spectrum.value ? spectrum.spectrum.value.rateHz / 2 : 0))
const peaks = computed(() => (peak.value ? peakFrequencies(peak.value) : []))
const enabled = computed(() => chosen('INS_HNTCH_ENABLE') !== 0)
/** The notch has a fixed centre: its tracking mode is Fixed, or its reference is 0 (nothing to track by). */
const fixed = computed(() => chosen('INS_HNTCH_MODE') === 0 || chosen('INS_HNTCH_REF') === 0)
const misses = computed(() => enabled.value && fixed.value && notchMissesPeaks(setting.value, peaks.value, nyquist.value))
/** A notch that follows the throttle, a sensor or the FFT moves its centre: the page cannot check it against the logged peaks. */
const tracking = computed(() => enabled.value && !fixed.value && peaks.value.length > 0)
const openId = computed(() => flights.logs.value.find(log => log.key === spectrum.open.value)?.id ?? 0)
const peaksText = computed(() => peaks.value.map(hz => number(hz, 0)).join(', '))
const bandsText = computed(() => (
  notchBands(setting.value, nyquist.value).map(band => `${number(band.from, 0)}-${number(band.to, 0)}`).join(', ')
))
</script>
