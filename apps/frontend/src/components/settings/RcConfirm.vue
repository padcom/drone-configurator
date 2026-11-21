<template>
  <div class="rc-confirm">
    <fieldset class="rc-style">
      <legend class="rc-heading">{{ t('settings.rc.style.title') }}</legend>
      <label v-for="style in STYLES" :key="style" :for="`${uid}-style-${style}`">
        <input
          :id="`${uid}-style-${style}`"
          type="radio"
          :name="`${uid}-style`"
          :value="style"
          :checked="mapping.draft.value?.throttleStyle === style"
          :aria-describedby="`${uid}-style-help-${style}`"
          @change="mapping.setStyle(style)"
        >
        {{ t(`settings.rc.style.${style}`) }}
      </label>
      <p :id="`${uid}-style-help-${current}`" class="muted">{{ t(`settings.rc.style.${current}Help`) }}</p>
    </fieldset>
    <h4 class="rc-heading">{{ t('settings.rc.confirm.title') }}</h4>
    <ul class="rc-sticks">
      <li v-for="stick in STICKS" :key="stick" :data-testid="`rc-stick-${stick}`">
        <span>{{ t(`settings.rc.sticks.${stick}`) }}</span>
        <ProgressBar :value="((levelOf(stick) ?? 0) + 1) / 2" :label="t(`settings.rc.sticks.${stick}`)" />
        <span class="mono">{{ levelOf(stick) === null ? t('settings.rc.noPulse') : number(levelOf(stick) ?? 0, 2) }}</span>
      </li>
    </ul>
    <p v-if="mapping.confirmed.value" id="rc-confirmed" class="muted" role="status">{{ t('settings.rc.confirm.done') }}</p>
    <template v-else>
      <p v-if="mapping.converted.value" id="rc-converted" class="rc-warn" role="status">
        {{ t('settings.rc.confirm.converted') }}
      </p>
      <p id="rc-unconfirmed" class="muted">{{ t('settings.rc.confirm.needed') }}</p>
    </template>
    <p v-if="resting.length > 0" id="rc-rest" class="muted" role="status">{{ resting.join(' ') }}</p>
    <Button
      id="rc-confirm"
      :disabled="!mapping.canConfirm.value || mapping.confirmed.value"
      :aria-describedby="mapping.canConfirm.value ? undefined : `${uid}-confirm-why`"
      @click="mapping.confirm()"
    >
      {{ t('settings.rc.confirm.button') }}
    </Button>
    <p v-if="!mapping.canConfirm.value && !mapping.confirmed.value" :id="`${uid}-confirm-why`" class="muted">
      {{ t('settings.rc.confirm.disabled') }}
    </p>
  </div>
</template>

<script setup lang="ts">
// How the throttle stick rests, and the one click that makes a mapping one the control may fly with: "Confirm this mapping", with
// the live bars of the vehicle's four sticks beside it (nothing is calibrated in the app: the person looks at them move). What
// the turn-on would wait for (a stick that is not at rest) is said here too, in words. Any change of the mapping takes the
// confirmation away, as does another pad or another layout of its channels.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import type { RcMapping } from '@/composables/useRcMapping'
import { useFormat } from '@/i18n/useFormat'
import { type Stick, levelText } from '@/lib/rc/rest'
import type { ThrottleStyle } from '@/lib/rc/types'

const props = defineProps<{
  /** The mapping on the screen. */
  mapping: RcMapping
}>()

const { t } = useI18n()
const { number } = useFormat()
const uid = useId()
const STYLES: ThrottleStyle[] = ['centred', 'low']
const STICKS: Stick[] = ['roll', 'pitch', 'throttle', 'yaw']
const current = computed(() => props.mapping.draft.value?.throttleStyle ?? 'centred')

/**
 * What the pad reads for one of the vehicle's four sticks.
 *
 * @param stick which stick
 * @returns the reading from -1 to 1, or null when no row drives it or no pad is read
 */
function levelOf(stick: Stick): number | null {
  const channel = props.mapping.sticks.value[stick]
  const row = props.mapping.draft.value?.rows.find(candidate => candidate.channel === channel)

  return row === undefined ? null : props.mapping.levelOf(row)
}

/** What each stick that is not at rest would be told: "Roll is not at the middle: +0.72. Centre the stick." */
const resting = computed(() => (props.mapping.notAtRest.value ?? []).map(({ stick, level, band }) => {
  const key = stick === 'throttle' ? `throttle${current.value === 'centred' ? 'Centred' : 'Low'}` : stick
  const within = band === undefined ? '' : ` ${t('rc.rest.within', { band: band.toFixed(2) })}`

  return t(`rc.rest.${key}`, { level: levelText(level) }) + within
}))
</script>
