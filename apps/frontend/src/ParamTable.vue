<template>
  <p id="list-status" class="muted">{{ status }}</p>
  <table>
    <thead>
      <tr>
        <th>{{ t('params.column.name') }}</th>
        <th>{{ t('params.column.value') }}</th>
        <th>{{ t('params.column.type') }}</th>
      </tr>
    </thead>
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
import { useI18n } from 'vue-i18n'
import { listStatusText, visibleParams } from './paramList'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { app, fields } = useConfigurator()
const visible = computed(() => visibleParams(fields.params.value, fields.filter.value))
const status = computed(() => {
  const { list, params, missing } = fields

  const counts = { list: list.value, total: params.value.length, missing: missing.value, shown: visible.value.length }

  return listStatusText(counts, t)
})
</script>
