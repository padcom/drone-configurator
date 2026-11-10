<template>
  <svg
    class="hud"
    :class="{ silent: model.silent }"
    viewBox="0 0 420 290"
    role="img"
    :aria-label="label"
  >
    <g v-if="attitude" class="horizon">
      <g :transform="`rotate(${-attitude.roll} 210 145)`">
        <g :transform="`translate(0 ${attitude.pitch * 5})`">
          <rect class="sky" x="-300" y="-500" width="1020" height="645" />
          <rect class="ground" x="-300" y="145" width="1020" height="645" />
          <line class="line" x1="-300" y1="145" x2="720" y2="145" stroke-width="2" />
          <line
            v-for="rung in LADDER"
            :key="rung"
            class="line rung"
            :x1="rung % 20 === 0 ? 170 : 185"
            :x2="rung % 20 === 0 ? 250 : 235"
            :y1="145 - rung * 5"
            :y2="145 - rung * 5"
            stroke-width="1.5"
          />
        </g>
      </g>
    </g>
    <path class="aircraft" d="M140 145h42l14 14 14-14M280 145h-42l-14 14-14-14" fill="none" />
    <g class="box">
      <rect x="0" y="120" width="76" height="50" />
      <text class="number" x="38" y="153" text-anchor="middle">{{ speed }}</text>
      <text class="unit" x="38" y="186" text-anchor="middle">{{ t('hud.unit.speed') }}</text>
      <rect x="344" y="120" width="76" height="50" />
      <text class="number" x="382" y="153" text-anchor="middle">{{ altitude }}</text>
      <text class="unit" x="382" y="186" text-anchor="middle">{{ t('hud.unit.altitude') }}</text>
      <rect x="172" y="6" width="76" height="34" />
      <text class="number heading" x="210" y="30" text-anchor="middle">{{ heading }}</text>
    </g>
    <template v-if="model.silent">
      <defs>
        <pattern :id="`${uid}-hatch`" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect class="hatch-ground" width="10" height="10" />
          <rect class="hatch-line" width="1.5" height="10" />
        </pattern>
      </defs>
      <rect :fill="`url(#${uid}-hatch)`" width="420" height="290" />
      <rect class="tag-box" x="90" y="224" width="240" height="38" rx="3" />
      <text class="tag" x="210" y="249" text-anchor="middle">{{ tag }}</text>
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../useFormat'
import type { HudModel, HudValue } from './model'

// The heads-up display, drawn as SVG (the design's, 420 x 290): the horizon with its pitch ladder, the speed, altitude and
// heading boxes. It draws a model (model.ts) and nothing else: the numbers are whatever the vehicle reported, a value it has
// not reported is a dash (and the horizon is not drawn without an attitude), and when the vehicle is not heard from the
// picture is hatched and says "last heard". The picture is described to a screen reader in words, since the numbers are the
// information.
const props = defineProps<{
  /** What to draw. */
  model: HudModel
  /** Whether the link is being brought back (the tag then says so). */
  reconnecting?: boolean
}>()

const LADDER = [-20, -10, 10, 20]
const { t } = useI18n()
const format = useFormat()
const uid = useId()
const missing = computed(() => t('telemetry.missing'))

/**
 * A value as the boxes show it.
 *
 * @param value the HUD value
 * @param digits how many decimals
 * @returns the number, or a dash when the vehicle has not reported it
 */
function show(value: HudValue, digits: number): string {
  return value.value === undefined ? missing.value : format.number(value.value, digits)
}

/**
 * A value as a sentence has it.
 *
 * @param value the HUD value
 * @param digits how many decimals
 * @returns the number, or the words "not reported"
 */
function say(value: HudValue, digits: number): string {
  return value.value === undefined ? t('truth.notReported') : format.number(value.value, digits)
}

// The horizon is drawn only when both angles are known: an attitude that is half made up is worse than none.
const attitude = computed(() => {
  const { roll, pitch } = props.model

  return roll.value === undefined || pitch.value === undefined ? null : { roll: roll.value, pitch: pitch.value }
})
const tag = computed(() => t(props.reconnecting ? 'hud.lastHeardReconnecting' : 'hud.lastHeard'))
const speed = computed(() => show(props.model.speed, 1))
const altitude = computed(() => show(props.model.altitude, 0))
const heading = computed(() => {
  const degrees = props.model.heading.value

  return degrees === undefined ? missing.value : `${String(Math.round(degrees) % 360).padStart(3, '0')}°`
})
const label = computed(() => t('hud.label', {
  roll: say(props.model.roll, 0),
  pitch: say(props.model.pitch, 0),
  speed: say(props.model.speed, 1),
  altitude: say(props.model.altitude, 0),
}))
</script>
