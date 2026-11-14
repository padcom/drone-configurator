<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('tune.section.rate') }}</h3>
      <p class="muted">{{ t('tune.rate.summary') }}</p>
      <label class="tune-link">
        <input v-model="linked" type="checkbox" :disabled="panel.writing.value">
        {{ t('tune.link') }}
      </label>
      <!-- Linking makes pitch take roll's value, so values that differ are not linked for the user: they may link them. -->
      <p v-if="!linked && differ" id="tune-rate-differ" class="muted">{{ t('tune.differ') }}</p>
      <section v-for="block in blocks" :key="block.key" class="tune-block" :aria-labelledby="`${uid}-${block.key}`">
        <h4 :id="`${uid}-${block.key}`" class="setup-label">{{ block.title }}</h4>
        <TuneSlider
          v-for="row in block.rows"
          :key="row.ids.join('+')"
          :label="row.label"
          :ids="row.ids"
          :param="row.param"
          :panel="panel"
        />
      </section>
      <p v-if="missing.length > 0" id="tune-rate-missing" class="muted">{{ t('tune.missing', { names: missing.join(', ') }) }}</p>
      <Button id="tune-rate-initial" :disabled="!movable || panel.writing.value" @click="backToInitial">
        {{ t('tune.backToInitial') }}
      </Button>
    </div>
    <PanelAside :panel="panel" id-prefix="tune-rate" :hold="refused" :refused-ids="refusedIds" only-changed no-revert />
  </section>
</template>

<script setup lang="ts">
// The rate loop: P, I, D and FF of roll, pitch and yaw. Roll and pitch are the same on most vehicles, so they are linked by
// default (one slider sets both, and both are written in ONE question that names both); unlinked, each has its own. Yaw is its
// own. Each slider has the name of its parameter and "was X"; only a parameter the vehicle has is a row, and the others are named
// under the rows.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import TuneSlider from '@/components/tune/TuneSlider.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import Button from '@/components/ui/Button.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useTunePanel } from '@/composables/useTunePanel'
import { type Axis, RATE_TERMS, type TuneParam, rateId, tuneGroup, tuneParam } from '@/lib/tune/table'

/** A slider of the page. */
interface Row {
  label: string
  ids: string[]
  param: TuneParam
}

/** A block of sliders under a heading. */
interface Block {
  key: string
  title: string
  rows: Row[]
}

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const rateIds = tuneGroup('rate').map(param => param.id)
const { panel, refused, refusedIds, movable, backToInitial, missing } = useTunePanel(rateIds, handle)
/** What the user chose for the link, or null while they have not: then they are linked if they are the same on the vehicle. */
const choice = ref<boolean | null>(null)
/** Whether roll and pitch differ on the vehicle in a term both have: linked, one would overwrite the other with its value. */
const differ = computed(() => RATE_TERMS.some(term => {
  const roll = panel.vehicleValue(rateId('RLL', term))
  const pitch = panel.vehicleValue(rateId('PIT', term))

  return roll !== null && pitch !== null && roll !== pitch
}))
const linked = computed({
  get: () => choice.value ?? !differ.value,
  set: (on: boolean) => {
    choice.value = on
  },
})

/**
 * The rows of one axis, or of the pair of roll and pitch (the ids of a pair are both axes').
 *
 * @param axes the axes the rows set
 * @returns a row for each term the vehicle has
 */
function rowsOf(axes: Axis[]): Row[] {
  return RATE_TERMS.flatMap(term => {
    const ids = axes.map(axis => rateId(axis, term))
    const param = tuneParam(ids[0] ?? '')

    const absent = param === undefined || ids.some(id => missing.value.includes(id))

    return absent ? [] : [{ label: t(`tune.rate.${term}`), ids, param }]
  })
}

const blocks = computed((): Block[] => {
  const named = (key: string, rows: Row[]): Block => ({ key, title: t(`tune.axis.${key}`), rows })
  const together = linked.value ? rowsOf(['RLL', 'PIT']) : []
  const rollPitch = together.length > 0
    ? [named('rollPitch', together)]
    : [named('roll', rowsOf(['RLL'])), named('pitch', rowsOf(['PIT']))]

  return [...rollPitch, named('yaw', rowsOf(['YAW']))].filter(block => block.rows.length > 0)
})
</script>
