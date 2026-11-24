<template>
  <PageSplit class="params-layout">
    <ParamGroups v-if="groups" />
    <Pane tag="section" class="params" contain :aria-label="t('params.list')">
      <template #top>
        <div class="toolbar">
          <ParamFilter />
          <ParamFilters />
          <SnapshotToolbar />
        </div>
        <SnapshotImport />
      </template>
      <!-- The comparison (#40) takes the list's place while it is open; the list keeps its search and its selection. -->
      <ParamCompare v-if="compare.open.value" />
      <!-- So do ArduPilot's frame presets (#41). -->
      <FramePresets v-else-if="presets.open.value" />
      <div v-show="!compare.open.value && !presets.open.value" class="param-list-slot">
        <ParamTable />
      </div>
    </Pane>
    <aside class="detail" :aria-label="t('params.detail')">
      <ParamEditor />
    </aside>
  </PageSplit>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRecentParams } from '@/composables/recentParams'
import { useGroupsSetting } from '@/composables/useGroupsSetting'
import { useParamShortcuts } from '@/lib/params/paramShortcuts'
import { useConfigurator } from '@/composables/useConfigurator'
import ParamCompare from '@/components/params/ParamCompare.vue'
import FramePresets from '@/components/params/FramePresets.vue'
import ParamEditor from '@/components/params/ParamEditor.vue'
import ParamFilter from '@/components/params/ParamFilter.vue'
import ParamFilters from '@/components/params/ParamFilters.vue'
import ParamGroups from '@/components/params/ParamGroups.vue'
import ParamTable from '@/components/params/ParamTable.vue'
import SnapshotImport from '@/components/params/SnapshotImport.vue'
import SnapshotToolbar from '@/components/params/SnapshotToolbar.vue'
import PageSplit from '@/components/ui/PageSplit.vue'
import Pane from '@/components/ui/Pane.vue'

// The Parameters screen, in three columns as the design has them: the groups of the list, the list (with its search and the
// snapshot tools above it and a footer that counts, and puts the initial values back, below it), and the detail of the selected
// parameter (its name and value above, the description that scrolls, the changes to write below). The columns are the layout of
// components/ui/Pane.vue and PageSplit.vue: from 1000 px wide each scrolls on its own and the parts above and below stay; below
// that they stack and the page scrolls (params.css).
// Ctrl+/ goes to the search from anywhere on the screen; Ctrl+Enter in the Value field or the list writes the changes.
const { t } = useI18n()
const { staged, compare, presets } = useConfigurator()
// The group list is there unless the setting "Show parameter groups" is off (in the Settings screen alone).
const { shown: groups } = useGroupsSetting()
useParamShortcuts({ sync: () => staged.sync() })
// A value queued for one parameter makes it one of the recently used (a reset of many, or a snapshot, does not).
const recent = useRecentParams()
watch(staged.changes, (now, before) => {
  const known = new Set(before.map(change => change.id))
  const added = now.filter(change => !known.has(change.id))
  if (added.length === 1 && added[0]) {
    void recent.touch(added[0].id)
  }
})
</script>
