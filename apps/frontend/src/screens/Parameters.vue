<template>
  <div class="params-layout">
    <ParamGroups v-if="groups" />
    <section class="params" :aria-label="t('params.list')">
      <div class="toolbar">
        <ParamFilter />
        <ParamView />
        <SnapshotToolbar />
      </div>
      <SnapshotImport />
      <ParamTable />
    </section>
    <aside class="detail" :aria-label="t('params.detail')">
      <ParamEditor />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useGroupsSetting } from '@/composables/useGroupsSetting'
import { useParamShortcuts } from '@/lib/params/paramShortcuts'
import { useConfigurator } from '@/composables/useConfigurator'
import ParamEditor from '@/components/params/ParamEditor.vue'
import ParamFilter from '@/components/params/ParamFilter.vue'
import ParamGroups from '@/components/params/ParamGroups.vue'
import ParamTable from '@/components/params/ParamTable.vue'
import ParamView from '@/components/params/ParamView.vue'
import SnapshotImport from '@/components/params/SnapshotImport.vue'
import SnapshotToolbar from '@/components/params/SnapshotToolbar.vue'

// The Parameters screen, in three columns as the design has them: the groups of the list, the list (with its search, the
// snapshot tools and a footer that counts), and the detail of the selected parameter. From 1000 px wide each scrolls on its
// own; below that they stack and the page scrolls (params.css).
// Ctrl+/ goes to the search from anywhere on the screen; Ctrl+Enter in the Value field or the list writes the changes.
const { t } = useI18n()
const { staged } = useConfigurator()
// The group list is there unless the setting "Show parameter groups" is off (in the Settings screen alone).
const { shown: groups } = useGroupsSetting()
useParamShortcuts({ sync: () => staged.sync() })
</script>
