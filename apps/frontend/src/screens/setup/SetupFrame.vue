<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.frame') }}</h3>
      <p class="muted">{{ t('setup.frame.summary') }}</p>
      <Banner id="setup-frame-warning" tone="warn">{{ t('setup.frame.warning') }}</Banner>
      <RebootBanner :show="rebootNeeded" />
      <div class="setup-fields">
        <label>{{ t('setup.frame.class') }}</label>
        <EnumField
          :model-value="panel.value('FRAME_CLASS') ?? 0"
          :options="classes"
          :label="t('setup.frame.class')"
          :disabled="locked('FRAME_CLASS')"
          @update:model-value="panel.set('FRAME_CLASS', $event)"
        />
        <label>{{ t('setup.frame.type') }}</label>
        <EnumField
          :model-value="panel.value('FRAME_TYPE') ?? 0"
          :options="types"
          :label="t('setup.frame.type')"
          :disabled="locked('FRAME_TYPE')"
          @update:model-value="panel.set('FRAME_TYPE', $event)"
        />
        <label>{{ t('setup.frame.orientation') }}</label>
        <EnumField
          :model-value="panel.value('AHRS_ORIENTATION') ?? 0"
          :options="orientations"
          :label="t('setup.frame.orientation')"
          :disabled="locked('AHRS_ORIENTATION')"
          @update:model-value="panel.set('AHRS_ORIENTATION', $event)"
        />
        <p class="muted">{{ t('setup.frame.orientationHelp') }}</p>
      </div>
      <FrameDiagram :frame-class="panel.value('FRAME_CLASS') ?? 0" :frame-type="panel.value('FRAME_TYPE') ?? 0" />
    </div>
    <PanelAside :panel="panel" id-prefix="setup-frame" />
  </section>
</template>

<script setup lang="ts">
// Frame and orientation: the class and type of the frame (how many motors, and how they are mixed) and how the board sits. A
// wrong frame makes the vehicle uncontrollable, so the page says so before anything is chosen, it is written only while the
// vehicle is disarmed (here and in the backend), and the change takes effect at the next boot: the page says "reboot needed"
// after the write and offers the reboot, which is held; it never reboots by itself. After a reboot the vehicle may report
// another kind (a hexa is not a quad); the connection follows it.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import FrameDiagram from '@/components/setup/FrameDiagram.vue'
import PanelAside from '@/components/setup/PanelAside.vue'
import RebootBanner from '@/components/setup/RebootBanner.vue'
import Banner from '@/components/ui/Banner.vue'
import EnumField from '@/components/fields/EnumField.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { FRAME_CLASSES, FRAME_PARAMS, FRAME_TYPES, ORIENTATIONS, optionsOf } from '@/lib/setup/frame'

const { t } = useI18n()
const uid = useId()
const panel = useParamPanel(FRAME_PARAMS, useConfigurator())
const classes = computed(() => optionsOf(FRAME_CLASSES, { value: 0, label: t('setup.frame.undefined') }))
const types = optionsOf(FRAME_TYPES)
const orientations = computed(() => optionsOf(ORIENTATIONS, { value: 0, label: t('setup.frame.noRotation') }))
const rebootNeeded = computed(() => panel.written.value.length > 0)

/**
 * Whether a field cannot be used now: nothing can be written, or the vehicle does not have the parameter.
 *
 * @param id the parameter
 * @returns true if it is off
 */
function locked(id: string): boolean {
  return panel.blocked.value !== null || panel.missing.value.includes(id)
}
</script>
