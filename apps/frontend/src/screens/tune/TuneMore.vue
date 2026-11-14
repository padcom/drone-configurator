<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('tune.section.more') }}</h3>
      <p class="muted">{{ t('tune.more.summary') }}</p>
      <section v-for="group in groups" :key="group" class="tune-block" :aria-labelledby="`${uid}-${group}`">
        <h4 :id="`${uid}-${group}`" class="setup-label">{{ t(`tune.group.${group}`) }}</h4>
        <template v-for="param in present(group)" :key="param.id">
          <div v-if="param.kind === 'choice'" class="tune-row" :data-tune="param.id">
            <div class="tune-head">
              <label :for="`${uid}-${param.id}`" class="tune-label">{{ t(`tune.name.${param.id}`) }}</label>
              <code class="tune-names">{{ param.id }}</code>
            </div>
            <EnumField
              :input-id="`${uid}-${param.id}`"
              :model-value="panel.value(param.id) ?? 0"
              :options="TUNE_FUNCTIONS"
              :label="t(`tune.name.${param.id}`)"
              :disabled="panel.blocked.value !== null"
              @update:model-value="panel.set(param.id, $event)"
            />
            <p class="muted tune-was">{{ wasOf(param.id) }}</p>
          </div>
          <TuneSlider v-else :label="t(`tune.name.${param.id}`)" :ids="[param.id]" :param="param" :panel="panel" />
        </template>
      </section>
      <p v-if="missing.length > 0" id="tune-more-missing" class="muted">{{ t('tune.missing', { names: missing.join(', ') }) }}</p>
      <Button id="tune-more-initial" :disabled="!movable || panel.writing.value" @click="backToInitial">
        {{ t('tune.backToInitial') }}
      </Button>
    </div>
    <PanelAside :panel="panel" id-prefix="tune-more" :hold="refused" only-changed />
  </section>
</template>

<script setup lang="ts">
// The other groups: how the attitude controller turns a lean angle into a rate (Attitude), how the sticks feel (Pilot feel), the
// position controller (Position) and what the radio knob tunes (Radio knob). Same rules as the rate loop: the parameter's name
// and "was X" on each, only a parameter the vehicle has is a row, a value beyond the hard limit stops the write, and the one
// question (or the hold, when the vehicle is armed) names every parameter.
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from '@/components/fields/EnumField.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import TuneSlider from '@/components/tune/TuneSlider.vue'
import Button from '@/components/ui/Button.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useTunePanel } from '@/composables/useTunePanel'
import { showNumber } from '@/lib/params/paramValue'
import { TUNE_FUNCTIONS, TUNE_PARAMS, type TuneGroup, type TuneParam, tuneGroup } from '@/lib/tune/table'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const groups: TuneGroup[] = ['attitude', 'feel', 'position', 'knob']
const ids = TUNE_PARAMS.filter(param => param.group !== 'rate').map(param => param.id)
const { panel, refused, movable, backToInitial, missing } = useTunePanel(ids, handle)

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
 * "was X" for a named choice, from the initial values.
 *
 * @param id the parameter
 * @returns the words
 */
function wasOf(id: string): string {
  const was = handle.parameters.initial.value?.values.get(id)

  return was === undefined ? t('tune.wasNone') : t('tune.was', { value: showNumber(was) })
}
</script>
