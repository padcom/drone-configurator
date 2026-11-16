<template>
  <section class="settings-rc" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="settings-group">{{ t('settings.rc.title') }}</h3>
    <p class="muted">{{ t('settings.rc.intro') }}</p>
    <div class="settings-row">
      <Toggle id="rc-allow" v-model="allow" :aria-describedby="`${uid}-allow-help`">{{ t('settings.rc.allow') }}</Toggle>
      <p :id="`${uid}-allow-help`" class="muted">{{ t('settings.rc.allowHelp') }}</p>
    </div>
    <p v-if="statusKey !== null" id="rc-status" class="muted" role="status">
      {{ t(`settings.rc.status.${statusKey}`) }}
    </p>
    <div class="rc-device">
      <h4 class="rc-heading">{{ t('settings.rc.device.title') }}</h4>
      <p v-if="mapping.device.value === null" id="rc-no-device" class="muted">{{ t('settings.rc.device.none') }}</p>
      <template v-else>
        <p id="rc-device-name" class="mono">{{ mapping.device.value }}</p>
        <p v-if="!pad.live.value" id="rc-device-gone" class="muted" role="status">{{ t('settings.rc.device.gone') }}</p>
        <ul v-else class="rc-axes">
          <li v-for="(value, axis) in sample.axes" :key="axis">
            <span>{{ t('settings.rc.device.axis', { n: axis }) }}</span>
            <ProgressBar :value="(value + 1) / 2" :label="t('settings.rc.device.axis', { n: axis })" />
            <span class="mono">{{ number(value, 2) }}</span>
          </li>
        </ul>
        <p v-if="pad.live.value" id="rc-buttons" class="muted">{{ buttonsText }}</p>
      </template>
    </div>
    <div v-if="mapping.draft.value !== null" class="rc-mapping">
      <h4 class="rc-heading">{{ t('settings.rc.mapping') }}</h4>
      <RcRows :mapping="mapping" />
      <RcWizard :mapping="mapping" :live="pad.live.value" />
      <ul v-if="mapping.issues.value.length > 0" id="rc-issues" class="rc-issues">
        <li v-for="(issue, index) in mapping.issues.value" :key="index" :class="{ warn: !issue.blocks }">
          {{ t(issueKey(issue), { channel: issue.channel }) }}
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
// "Remote control" in Settings: whether it is allowed (off by default, and for a simulator only), the pad that is read and
// what it says now, the mapping of its sticks, switches and buttons to the vehicle's channels (every row with the pulse it
// makes now), the calibration wizard, and what stands in the way of turning control on. This screen only reads the pad and
// keeps the mapping in the settings: control is never turned on from here (nothing here talks to the vehicle).
import { computed, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import RcRows from '@/components/settings/RcRows.vue'
import RcWizard from '@/components/settings/RcWizard.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useGamepad } from '@/composables/useGamepad'
import { type Issue, useRcMapping } from '@/composables/useRcMapping'
import { useRcSettings } from '@/composables/useRcSettings'
import { useFormat } from '@/i18n/useFormat'
import type { PadSample } from '@/lib/rc/types'
import { factsOf } from '@/lib/rc/vehicle'

const { t } = useI18n()
const { number } = useFormat()
const { vehicle, parameters } = useConfigurator()
const uid = useId()
const settings = useRcSettings()
const pad = useGamepad()
const facts = computed(() => factsOf(parameters.params.value, parameters.list.value === 'complete'))
const mapping = useRcMapping({ pad, settings, facts, request: vehicle.request })

const allow = computed({
  get: () => settings.allowed.value,
  set: (next: boolean) => void settings.allow(next),
})
const EMPTY: PadSample = { axes: [], buttons: [] }
/** What the pad says now (nothing when none is read). */
const sample = computed(() => (pad.reading.value.kind === 'live' ? pad.reading.value.sample : EMPTY))
const buttonsText = computed(() => {
  const pressed = sample.value.buttons.flatMap((value, index) => (value >= 0.5 ? [index] : []))

  return pressed.length === 0 ? t('settings.rc.device.noButtons') : t('settings.rc.device.buttons', { list: pressed.join(', ') })
})
/** What to say of why control cannot be turned on yet, when it is not the mapping's or the vehicle's (they are listed below). */
const statusKey = computed(() => {
  const block = mapping.block.value

  if (block === null) {
    return 'ready'
  }

  return block === 'link' || block === 'pad' ? block : null
})

/**
 * The words of an issue: the mapping's or the vehicle's by its code (the vehicle that is not known as a whole has its own).
 *
 * @param issue the issue
 * @returns the key of its message
 */
function issueKey(issue: Issue): string {
  const whole = issue.code === 'unknown' && issue.channel === 0

  return whole ? 'settings.rc.issue.vehicle.unknownAll' : `settings.rc.issue.${issue.from}.${issue.code}`
}

onMounted(() => {
  pad.start()
})
</script>
