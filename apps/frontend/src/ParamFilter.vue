<template>
  <input
    id="filter"
    :value="fields.filter.value"
    :placeholder="t('params.filter')"
    :aria-label="t('params.filter')"
    autocomplete="off"
    @input="parameters.setFilter(($event.target as HTMLInputElement).value)"
  >
  <button id="refresh" type="button" :disabled="!download" @click="parameters.refresh()">{{ t('params.download') }}</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { canDownload } from './paramList'
import { useConfigurator } from './useConfigurator'

const { t } = useI18n()
const { parameters, fields } = useConfigurator()
const download = computed(() => canDownload(fields.connection.value.state, fields.list.value))
</script>
