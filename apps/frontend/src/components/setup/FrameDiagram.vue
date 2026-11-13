<template>
  <figure class="setup-frame-drawing">
    <svg
      v-if="motors"
      viewBox="-100 -100 200 200"
      role="img"
      :aria-label="label"
      width="220"
      height="220"
    >
      <path class="front" d="M0 -92 L8 -76 L-8 -76 Z" />
      <g v-for="motor in drawn" :key="motor.number" :data-motor="motor.number">
        <line x1="0" y1="0" :x2="motor.x" :y2="motor.y" class="arm" />
        <circle :cx="motor.x" :cy="motor.y" r="13" class="motor" />
        <text :x="motor.x" :y="motor.y + 4" text-anchor="middle" class="number">{{ motor.number }}</text>
        <text :x="motor.x" :y="motor.y - 17" text-anchor="middle" class="spin">{{ motor.spin === 'cw' ? '↻' : '↺' }}</text>
      </g>
    </svg>
    <p v-else class="muted" id="setup-frame-nodrawing">{{ t('setup.frame.noDrawing') }}</p>
    <figcaption v-if="motors" class="muted">{{ t('setup.frame.caption') }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
// The motors of a frame as ArduPilot lays them out (the angles of libraries/AP_Motors/AP_MotorsMatrix.cpp): the front is up, each
// motor has its number in the motor test and an arrow for the way it spins. A frame this page has no layout for says so, and
// draws nothing: no layout is guessed. The drawing is read out as a list of motors.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { layoutOf, pointOf } from '@/lib/setup/frame'

const props = defineProps<{
  /** FRAME_CLASS. */
  frameClass: number
  /** FRAME_TYPE. */
  frameType: number
}>()

const { t } = useI18n()
const motors = computed(() => layoutOf(props.frameClass, props.frameType))
const drawn = computed(() => (motors.value ?? []).map(motor => ({ ...motor, ...pointOf(motor.angle, 62) })))
const label = computed(() => (motors.value ?? [])
  .map(motor => t('setup.frame.motor', { number: motor.number, angle: motor.angle, spin: t(`setup.frame.${motor.spin}`) }))
  .join('; '))
</script>
