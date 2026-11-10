<template>
  <div class="params-layout">
    <ParamGroups />
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
import { useMetadataToasts } from '../metadataToasts'
import { useParamShortcuts } from '../paramShortcuts'
import { useConfigurator } from '../useConfigurator'
import ParamEditor from '../ParamEditor.vue'
import ParamFilter from '../ParamFilter.vue'
import ParamGroups from '../ParamGroups.vue'
import ParamTable from '../ParamTable.vue'
import ParamView from '../ParamView.vue'
import SnapshotImport from '../SnapshotImport.vue'
import SnapshotToolbar from '../SnapshotToolbar.vue'

// The Parameters screen, in three columns as the design has them: the groups of the list, the list (with its search, the
// snapshot tools and a footer that counts), and the detail of the selected parameter. From 1000 px wide each scrolls on its
// own; below that they stack and the page scrolls (params.css).
// Ctrl+/ goes to the search from anywhere on the screen; Ctrl+Enter in the Value field or the list writes the changes.
const { t } = useI18n()
const { staged } = useConfigurator()
useParamShortcuts({ sync: () => staged.sync() })
// How a metadata file went is told by a toast.
useMetadataToasts()
</script>
