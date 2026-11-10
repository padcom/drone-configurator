<template>
  <div class="params-layout">
    <ParamGroups />
    <section class="params" :aria-label="t('params.list')">
      <div class="toolbar">
        <ParamFilter />
        <SnapshotToolbar />
      </div>
      <MetadataStatus />
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
import MetadataStatus from '../MetadataStatus.vue'
import ParamEditor from '../ParamEditor.vue'
import ParamFilter from '../ParamFilter.vue'
import ParamGroups from '../ParamGroups.vue'
import ParamTable from '../ParamTable.vue'
import SnapshotImport from '../SnapshotImport.vue'
import SnapshotToolbar from '../SnapshotToolbar.vue'

// The Parameters screen, in three columns as the design has them: the groups of the list, the list (with its search, the
// snapshot tools and a footer that counts), and the detail of the selected parameter. From 1000 px wide each scrolls on its
// own; below that they stack and the page scrolls (params.css).
const { t } = useI18n()
</script>
