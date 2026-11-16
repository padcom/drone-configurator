<template>
  <div class="plan-sketch">
    <svg
      v-if="sketch.points.length > 0"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="t('plan.sketch.label')"
    >
      <polyline v-if="sketch.points.length > 1" :points="line" class="plan-route" />
      <g
        v-for="point in sketch.points"
        :key="point.id"
        class="plan-pin"
        :class="{ selected: point.id === selected }"
        @click="state.select(point.id)"
      >
        <circle :cx="point.x" :cy="point.y" r="26" />
        <text :x="point.x" :y="point.y + 9" text-anchor="middle">{{ point.number }}</text>
      </g>
      <template v-if="sketch.metresPerHundred !== null">
        <line class="plan-scale-bar" x1="40" y1="960" :x2="40 + barUnits" y2="960" />
        <text class="plan-scale-text" x="40" y="940">{{ t('plan.sketch.scale', { metres: scale }) }}</text>
      </template>
    </svg>
    <p v-else class="plan-sketch-empty">{{ t('plan.sketch.empty') }}</p>
  </div>
</template>

<script setup lang="ts">
// The route of the plan drawn from the places of its items alone, north up, the pins numbered as the items are: the shape of the
// plan, with no map under it (the map comes with the editing of it). A pin selects its item. The scale bar is a round number of
// metres (1, 2 or 5 times a power of ten) drawn to the length it has in the picture.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlan } from '@/composables/usePlan'

const { t } = useI18n()
const state = usePlan()
const { sketch, selected } = state
const line = computed(() => sketch.value.points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '))

/**
 * A round number of metres (1, 2 or 5 times a power of ten) that is no more than the length of a hundred units of the picture.
 */
const scale = computed(() => {
  const metres = sketch.value.metresPerHundred ?? 0
  const power = 10 ** Math.floor(Math.log10(Math.max(metres, 1)))
  const lead = metres / power

  return Math.round(lead >= 5 ? 5 * power : lead >= 2 ? 2 * power : power)
})
/** How long that is in the picture (units): the bar drawn under the route. */
const barUnits = computed(() => (scale.value / (sketch.value.metresPerHundred ?? 1)) * 100)
</script>
