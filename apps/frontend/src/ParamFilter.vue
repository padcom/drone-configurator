<template>
  <input
    id="filter"
    :value="fields.filter.value"
    placeholder="Filter parameters"
    aria-label="Filter parameters"
    autocomplete="off"
    @input="app.setFilter(($event.target as HTMLInputElement).value)"
  >
  <button id="refresh" type="button" :disabled="!download" @click="app.refresh()">Download</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { canDownload } from './paramList'
import { useConfigurator } from './useConfigurator'

const { app, fields } = useConfigurator()
const download = computed(() => canDownload(fields.connection.value.state, fields.list.value))
</script>
