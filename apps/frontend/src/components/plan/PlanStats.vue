<template>
  <div class="plan-stats" role="group" :aria-label="t('plan.stats.label')">
    <StatCell :label="t('plan.stats.items')">{{ stats.items }}</StatCell>
    <StatCell :label="t('plan.stats.distance')">{{ distance }}</StatCell>
    <StatCell :label="t('plan.stats.highest')">{{ highest }}</StatCell>
  </div>
</template>

<script setup lang="ts">
// What the plan says of itself from its items alone: how many, how far the route is through the places that are set, and the
// highest altitude. A number the plan cannot give (a distance of fewer than two places) is a dash, never a made-up value; the
// time
// and the battery need what a vehicle knows and come with it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import StatCell from '@/components/ui/StatCell.vue'
import { usePlan } from '@/composables/usePlan'

const { t } = useI18n()
const { stats } = usePlan()

/** The length of the route, in metres below a kilometre and in kilometres from it. */
const distance = computed(() => {
  const metres = stats.value.distance
  if (metres === null) {
    return '—'
  }

  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`
})
const highest = computed(() => (stats.value.highest === null ? '—' : `${stats.value.highest} m`))
</script>
