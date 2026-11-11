<template>
  <svg
    class="hud"
    :class="{ silent: model.silent }"
    viewBox="0 0 420 290"
    role="img"
    :aria-label="label"
  >
    <defs>
      <pattern :id="`${uid}-hatch`" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect class="hatch-ground" width="10" height="10" />
        <rect class="hatch-line" width="1.5" height="10" />
      </pattern>
    </defs>
    <g v-if="attitude" class="horizon" :class="{ old: attitudeOld }">
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
    <g v-for="box in boxes" :key="box.id" class="box" :class="[box.id, { old: box.old }]">
      <rect :x="box.x" :y="box.y" width="76" :height="box.height" />
      <text class="number" :class="{ heading: box.id === 'heading' }" :x="box.x + 38" :y="box.textY" text-anchor="middle">
        {{ box.text }}
      </text>
      <text v-if="box.unit" class="unit" :x="box.x + 38" :y="box.textY + 33" text-anchor="middle">{{ box.unit }}</text>
      <template v-if="box.old">
        <rect :fill="`url(#${uid}-hatch)`" :x="box.x" :y="box.y" width="76" :height="box.height" />
        <text class="stale-word" :x="box.x + 38" :y="box.wordY" text-anchor="middle">{{ t('hud.stale') }}</text>
      </template>
    </g>
    <template v-if="model.silent">
      <rect :fill="`url(#${uid}-hatch)`" width="420" height="290" />
      <rect class="tag-box" x="90" y="224" width="240" height="38" rx="3" />
      <text class="tag" x="210" y="249" text-anchor="middle">{{ tag }}</text>
    </template>
    <template v-else-if="attitudeOld">
      <rect class="tag-box" x="110" y="224" width="200" height="38" rx="3" />
      <text class="tag" x="210" y="249" text-anchor="middle">{{ t('hud.attitudeStale') }}</text>
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '@/i18n/useFormat'
import type { HudModel, HudValue } from '@/lib/fly/hud/model'

// The heads-up display, drawn as SVG (the design's, 420 x 290): the horizon with its pitch ladder, the speed, altitude and
// heading boxes. It draws a model (model.ts) and nothing else: the numbers are whatever the vehicle reported, a value it has
// not reported is a dash (and the horizon is not drawn without an attitude). When the vehicle is not heard from the whole
// picture is hatched and says "last heard"; when only one group has gone quiet, that value is dimmed, hatched and marked
// "stale" in words (never colour alone). The picture is described to a screen reader in words too, state included, since
// the text inside an image is not read.
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
 * @param unit the message that puts the number in words
 * @returns the number with its unit in words, or the words "not reported"
 */
function say(value: HudValue, digits: number, unit: string): string {
  return value.value === undefined ? t('truth.notReported') : t(unit, { value: format.number(value.value, digits) })
}

// The horizon is drawn only when both angles are known: an attitude that is half made up is worse than none.
const attitude = computed(() => {
  const { roll, pitch } = props.model

  return roll.value === undefined || pitch.value === undefined ? null : { roll: roll.value, pitch: pitch.value }
})
// Old values are marked one by one only while the vehicle as a whole is heard from (else the whole picture is hatched).
const old = (value: HudValue) => !props.model.silent && value.stale
const attitudeOld = computed(() => attitude.value !== null && (old(props.model.roll) || old(props.model.pitch)))
const tag = computed(() => t(props.reconnecting ? 'hud.lastHeardReconnecting' : 'hud.lastHeard'))
const heading = computed(() => {
  const degrees = props.model.heading.value

  return degrees === undefined ? missing.value : `${String(Math.round(degrees) % 360).padStart(3, '0')}°`
})
/** Where each box is, and what it shows (the heading has no unit under it). */
const LAYOUT = [
  { id: 'speed', x: 0, y: 120, height: 50, textY: 153, wordY: 202, digits: 1, unit: 'hud.unit.speed' },
  { id: 'altitude', x: 344, y: 120, height: 50, textY: 153, wordY: 202, digits: 0, unit: 'hud.unit.altitude' },
  { id: 'heading', x: 172, y: 6, height: 34, textY: 30, wordY: 56, digits: 0, unit: '' },
] as const
const boxes = computed(() => LAYOUT.map(box => ({
  ...box,
  text: box.id === 'heading' ? heading.value : show(props.model[box.id], box.digits),
  unit: box.unit && t(box.unit),
  old: old(props.model[box.id]),
})))
// Which values are old, in words, for a screen reader (the whole picture being old is said by its tag).
const staleNames = computed(() => [
  ...(attitudeOld.value ? [t('hud.name.attitude')] : []),
  ...boxes.value.filter(box => box.old).map(box => t(`hud.name.${box.id}`)),
])
const label = computed(() => [
  t('hud.label', {
    roll: say(props.model.roll, 0, 'hud.say.degrees'),
    pitch: say(props.model.pitch, 0, 'hud.say.degrees'),
    speed: say(props.model.speed, 1, 'hud.say.speed'),
    altitude: say(props.model.altitude, 0, 'hud.say.altitude'),
  }),
  props.model.silent ? `${tag.value}.` : '',
  staleNames.value.length > 0 ? t('hud.staleValues', { names: staleNames.value.join(', ') }) : '',
].filter(Boolean).join(' '))
</script>
