<template>
  <div class="params-layout">
    <section class="params">
      <div class="toolbar">
        <ParamFilter />
        <SnapshotToolbar />
      </div>
      <MetadataStatus />
      <SnapshotImport />
      <ParamTable />
    </section>
    <aside class="detail">
      <ParamEditor />
    </aside>
  </div>
</template>

<script setup lang="ts">
import MetadataStatus from '../MetadataStatus.vue'
import ParamEditor from '../ParamEditor.vue'
import ParamFilter from '../ParamFilter.vue'
import ParamTable from '../ParamTable.vue'
import SnapshotImport from '../SnapshotImport.vue'
import SnapshotToolbar from '../SnapshotToolbar.vue'
</script>
