<template>
  <p id="list-status" class="muted">{{ status }}</p>
  <table>
    <thead><tr><th>Name</th><th>Value</th><th>Type</th></tr></thead>
    <tbody id="rows">
      <tr
        v-for="param in visible"
        :key="param.id"
        :data-id="param.id"
        :class="{ selected: param.id === fields.selected.value }"
        @click="app.select(param.id)"
      ><td>{{ param.id }}</td><td class="num">{{ param.value }}</td><td>{{ param.type }}</td></tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { listStatusText, visibleParams } from './paramList'
import { useConfigurator } from './useConfigurator'

const { app, fields } = useConfigurator()
const visible = computed(() => visibleParams(fields.params.value, fields.filter.value))
const status = computed(() => {
  const { list, params, missing } = fields

  return listStatusText(list.value, params.value.length, missing.value, visible.value.length)
})
</script>
