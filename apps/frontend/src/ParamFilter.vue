<template>
  <div class="param-search">
    <Icon name="search" />
    <input
      id="filter"
      :value="fields.filter.value"
      :placeholder="t('params.filter')"
      :aria-label="t('params.filter')"
      autocomplete="off"
      @input="parameters.setFilter(($event.target as HTMLInputElement).value)"
    >
    <button
      v-if="fields.filter.value !== ''"
      id="clear-filter"
      type="button"
      :aria-label="t('params.clearSearch')"
      @click="parameters.setFilter('')"
    >
      <Icon name="close" />
    </button>
  </div>
  <button id="refresh" type="button" :disabled="!download" @click="parameters.refresh()">{{ t('params.download') }}</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from './kit/Icon.vue'
import { canDownload } from './paramList'
import { useConfigurator } from './useConfigurator'

// The search by name, with a way to clear it, and the button that downloads the list again.
const { t } = useI18n()
const { parameters, fields } = useConfigurator()
const download = computed(() => canDownload(fields.connection.value.state, fields.list.value))
</script>
