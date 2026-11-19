<template>
  <section class="settings-rc" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="settings-group">{{ t('settings.rc.title') }}</h3>
    <p class="muted">{{ t('settings.rc.intro') }}</p>
    <div class="settings-row">
      <Toggle id="rc-allow" v-model="allow" :aria-describedby="`${uid}-allow-help`">{{ t('settings.rc.allow') }}</Toggle>
      <p :id="`${uid}-allow-help`" class="muted">{{ t('settings.rc.allowHelp') }}</p>
    </div>
    <div class="settings-row">
      <Toggle id="rc-rudder-arm" v-model="rudderArm" :disabled="!allow" :aria-describedby="rudderDescription">
        {{ t('settings.rc.rudderArm') }}
      </Toggle>
      <p :id="`${uid}-rudder-help`" class="muted">{{ t('settings.rc.rudderArmHelp') }}</p>
      <p v-if="!allow" :id="`${uid}-rudder-shut`" class="muted">{{ t('settings.rc.rudderArmShut') }}</p>
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
          <li v-for="(value, index) in channels" :key="index" :class="{ 'rc-absent': value === null }">
            <span>{{ t('settings.rc.device.channel', { n: index + 1 }) }}</span>
            <ProgressBar :value="((value ?? 0) + 1) / 2" :label="t('settings.rc.device.channel', { n: index + 1 })" />
            <span class="mono">{{ value === null ? t('settings.rc.noPulse') : number(value, 2) }}</span>
          </li>
        </ul>
        <p v-if="pad.live.value" id="rc-channels-note" class="muted">{{ t('settings.rc.channelsNote') }}</p>
      </template>
    </div>
    <div v-if="mapping.draft.value !== null" class="rc-mapping">
      <h4 class="rc-heading">{{ t('settings.rc.mapping') }}</h4>
      <RcRows :mapping="mapping" />
      <RcConfirm :mapping="mapping" />
      <ul v-if="mapping.issues.value.length > 0" id="rc-issues" class="rc-issues">
        <li v-for="(issue, index) in mapping.issues.value" :key="index" :class="{ warn: !issue.blocks }">
          {{ t(issueKey(issue), { channel: issue.channel }) }}
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
// "Remote control" in Settings: whether it is allowed (off by default, and for a simulator only), the pad that is read and what
// it says now (CH1 to CH16, every channel proportional), the mapping of its channels to the vehicle's (every row with what it
// reads and the pulse it makes now), how the throttle stick rests, the one click that confirms the mapping, and what stands in
// the way of turning control on. This screen only reads the pad and keeps the mapping in the settings: control is never turned
// on from here (nothing here talks to the vehicle).
import { computed, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import RcConfirm from '@/components/settings/RcConfirm.vue'
import RcRows from '@/components/settings/RcRows.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Toggle from '@/components/ui/Toggle.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useGamepad } from '@/composables/useGamepad'
import { type Issue, useRcMapping } from '@/composables/useRcMapping'
import { useRcSettings } from '@/composables/useRcSettings'
import { useFormat } from '@/i18n/useFormat'
import { CHANNELS } from '@/lib/rc/types'
import { factsOf } from '@/lib/rc/vehicle'

const { t } = useI18n()
const { number } = useFormat()
const { vehicle, parameters } = useConfigurator()
const uid = useId()
const settings = useRcSettings()
const pad = useGamepad()
const facts = computed(() => factsOf(parameters.params.value, parameters.list.value === 'complete'))
const mode = computed(() => vehicle.telemetry.value?.mode)
const connected = computed(() => vehicle.connection.value.state === 'connected')
const mapping = useRcMapping({ pad, settings, facts, request: vehicle.request, mode, connected })

const allow = computed({
  get: () => settings.allowed.value,
  set: (next: boolean) => void settings.allow(next),
})
const rudderArm = computed({
  get: () => settings.rudderArm.value,
  set: (next: boolean) => void settings.setRudderArm(next),
})
/** What the switch is described by: its line, and why it is shut while remote control is not allowed. */
const rudderDescription = computed(() => `${uid}-rudder-help${allow.value ? '' : ` ${uid}-rudder-shut`}`)
/** What the pad says now: CH1 to CH16, null for a channel it has not (nothing when none is read). */
const channels = computed(() => {
  const reading = pad.reading.value

  return reading.kind === 'live' ? reading.sample.channels : Array.from({ length: CHANNELS }, () => null)
})
/**
 * What to say of where control stands, once each: that everything is in place, or that no simulator is connected. The setting
 * says itself (the switch), the pad is the Gamepad part's to say, and the mapping's and the vehicle's problems are listed below.
 */
const statusKey = computed(() => {
  const block = mapping.block.value

  if (block === null) {
    return 'ready'
  }

  return block === 'link' ? block : null
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
