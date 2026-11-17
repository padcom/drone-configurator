<template>
  <div class="plan" data-l="plan" @keydown.esc="setAdding(false)">
    <PlanBar />
    <div class="plan-body">
      <section class="plan-main" :aria-label="t('plan.main')">
        <!-- The map stays (hidden) while the table is shown: where the person had it is where it is when they come back. -->
        <div
          v-show="tool === 'mission'"
          id="plan-panel-mission"
          class="plan-panel"
          role="tabpanel"
          aria-labelledby="plan-tab-mission"
        >
          <PlanMap />
        </div>
        <div
          v-if="tool === 'table'"
          id="plan-panel-table"
          class="plan-panel plan-panel-table"
          role="tabpanel"
          aria-labelledby="plan-tab-table"
        >
          <PlanTable />
        </div>
        <PlanStats />
      </section>
      <aside class="plan-aside" tabindex="-1" :aria-label="t('plan.aside')">
        <PlanValidity />
        <PlanList />
        <PlanDetail />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
// The Plan page: the bar with the plan's name, the tools and Undo, at the left the tool (the map with the route over it, or the
// table of the items) and the numbers the plan can say of itself, at the right (it scrolls on its own, as the Fly page's does)
// what is wrong with the plan, the items and the form of the selected one. The plan is edited here and kept while the
// application runs; it needs no vehicle, and nothing on this page reads or writes one (the vehicle's own plan comes with the
// stories that do). The map asks the backend for the tiles of the area on screen, as the Fly page's does, unless Settings > Map
// has the map off or offline.
import { useI18n } from 'vue-i18n'
import PlanBar from '@/components/plan/PlanBar.vue'
import PlanDetail from '@/components/plan/PlanDetail.vue'
import PlanList from '@/components/plan/PlanList.vue'
import PlanMap from '@/components/plan/PlanMap.vue'
import PlanStats from '@/components/plan/PlanStats.vue'
import PlanTable from '@/components/plan/PlanTable.vue'
import PlanValidity from '@/components/plan/PlanValidity.vue'
import { usePlan } from '@/composables/usePlan'

const { t } = useI18n()
// Escape, wherever the focus is on the page, leaves the mode in which a click on the map adds a waypoint (it does nothing else).
const { setAdding, tool } = usePlan()
</script>
