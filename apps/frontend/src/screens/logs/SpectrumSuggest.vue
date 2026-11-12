
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
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" :data-id="row.id">
          <th scope="row">{{ row.id }}</th>
          <td>{{ row.now }}</td>
          <td class="spectrum-suggested">{{ row.to }}</td>
          <td>{{ row.because }}</td>
        </tr>
      </tbody>
    </table>
    <p class="muted">{{ t('logs.spectrum.suggest.note') }}</p>
    <p v-if="!connected" id="spectrum-suggest-offline" class="muted">{{ t('logs.spectrum.suggest.offline') }}</p>
    <!-- Values from a log of another kind of vehicle (or of one that cannot be told) are added only by a second press that names both. -->
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
// The values of the harmonic notch that the peak of a spectrum suggests, with where each comes from: the log, the sensor, the peak.
// Nothing is written: "Add to the changes" puts them in the list of parameter changes (the review), where they are written after one
// question, each read back. Values from a log of another kind of vehicle than the one connected (or of one that is not known) need a
// second press that names both.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import Button from '@/components/ui/Button.vue'
import SecondPress from '@/components/ui/SecondPress.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import type { SpectrumPeak } from '@/generated/app'
import { useFormat } from '@/i18n/useFormat'
import { sameKind, suggestNotch } from '@/lib/logs/spectrum'
import { showNumber } from '@/lib/params/paramValue'

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
const kind = computed(() => sameKind(props.firmware, fields.connection.value.vehicle?.type))
const suggestions = computed(() => suggestNotch(props.peak))
const added = ref<number | null>(null)

const rows = computed(() => suggestions.value.map(s => ({
  id: s.id,
  to: s.to,
  now: parameters.params.value.find(param => param.id === s.id)?.value,
  because: t(`logs.spectrum.suggest.why.${s.because}`, { hz: number(props.peak.hz, 0), count: props.peak.harmonics.length }),
})).map(row => ({ ...row, now: row.now === undefined ? '—' : showNumber(row.now) })))

const addedText = computed(() => (added.value === null ? '' : t('logs.spectrum.suggest.added', { count: added.value }, added.value)))

/** Queues the values (nothing is written); a value the vehicle has already is not a change. */
function add(): void {
  added.value = staged.stage(suggestions.value.map(s => ({ id: s.id, to: s.to })))
}
</script>
