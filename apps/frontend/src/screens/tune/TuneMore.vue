<template>
  <TunePage :tune="tune" :title="t('tune.section.more')" id-prefix="tune-more">
    <p class="muted">{{ t('tune.more.summary') }}</p>
    <section v-for="group in groups" :key="group" class="tune-block" :aria-labelledby="`${uid}-${group}`">
      <h4 :id="`${uid}-${group}`" class="setup-label">{{ t(`tune.group.${group}`) }}</h4>
      <template v-for="param in present(group)" :key="param.id">
        <TuneChoice
          v-if="param.kind === 'choice' && param.id === 'MOT_HOVER_LEARN'"
          :label="t(`tune.name.${param.id}`)"
          :param="param"
          :options="HOVER_LEARN"
          :panel="panel"
        />
        <TuneBits
          v-else-if="param.kind === 'bits'"
          :label="t(`tune.name.${param.id}`)"
          :param="param"
          :bits="AUTOTUNE_AXES"
          :panel="panel"
          :help="t('tune.axesNote')"
        />
        <div v-else-if="param.kind === 'choice'" class="tune-row" :data-tune="param.id">
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
        <template v-else>
          <TuneSlider :label="t(`tune.name.${param.id}`)" :ids="[param.id]" :param="param" :panel="panel" />
          <div v-if="param.id === 'MOT_THST_HOVER' && learning" class="tune-hover-learning" data-testid="hover-learning">
            <p class="muted">{{ t('tune.hoverLearning') }}</p>
            <Button :disabled="panel.blocked.value !== null || !hasLearn" @click="panel.set('MOT_HOVER_LEARN', 0)">
              {{ t('tune.hoverDisable') }}
            </Button>
          </div>
        </template>
      </template>
    </section>
    <p v-if="missing.length > 0" id="tune-more-missing" class="muted">{{ t('tune.missing', { names: missing.join(', ') }) }}</p>
  </TunePage>
</template>

<script setup lang="ts">
// The other groups: how the attitude controller turns a lean angle into a rate (Attitude), how the sticks feel (Pilot feel), the
// position controller (Position), the hover throttle and its learning, AutoTune's settings (both are changed in flight: AutoTune
// needs them there) and what the radio knob tunes (Radio knob). Same rules as the rate loop: the parameter's name
// and "was X" on each, only a parameter the vehicle has is a row, a value beyond the hard limit stops the write, and the one
// question (or the hold, when the vehicle is armed) names every parameter.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EnumField from '@/components/fields/EnumField.vue'
import TuneBits from '@/components/tune/TuneBits.vue'
import TuneChoice from '@/components/tune/TuneChoice.vue'
import TunePage from '@/components/tune/TunePage.vue'
import TuneSlider from '@/components/tune/TuneSlider.vue'
import Button from '@/components/ui/Button.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useTunePanel } from '@/composables/useTunePanel'
import { showNumber } from '@/lib/params/paramValue'
import { AUTOTUNE_AXES, HOVER_LEARN } from '@/lib/tune/autotune'
import { TUNE_FUNCTIONS, TUNE_PARAMS, type TuneGroup, type TuneParam, tuneGroup } from '@/lib/tune/table'

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const groups: TuneGroup[] = ['attitude', 'feel', 'position', 'hover', 'autotune', 'knob']
const ids = TUNE_PARAMS.filter(param => groups.includes(param.group)).map(param => param.id)
const tune = useTunePanel(ids, handle)
const { panel, missing } = tune
// While the hover learning is on (or not known), the vehicle pulls the hover throttle towards what it needs: a number written
// there is not kept (AP_MotorsMulticopter::update_throttle_hover).
const hasLearn = computed(() => !missing.value.includes('MOT_HOVER_LEARN'))
const learning = computed(() => panel.value('MOT_HOVER_LEARN') !== 0)

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
