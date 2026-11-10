<template>
  <div class="param-search">
    <Icon name="search" />
    <input
      id="filter"
      :value="fields.filter.value"
      :placeholder="t('params.filterHint')"
      :aria-label="t('params.filter')"
      aria-keyshortcuts="Control+/"
      :title="t('params.filterHint')"
      autocomplete="off"
      @input="parameters.setFilter(($event.target as HTMLInputElement).value)"
      @keydown.enter="focusList"
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
  <Button id="refresh" :disabled="!download" @click="parameters.refresh()">{{ t('params.download') }}</Button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import Icon from './kit/Icon.vue'
import { canDownload } from './paramList'
import { useConfigurator } from './useConfigurator'

// The search by name, with a way to clear it, and the button that downloads the list again.
const { t } = useI18n()
const { parameters, fields } = useConfigurator()
const download = computed(() => canDownload(fields.connection.value.state, fields.list.value))

/**
 * Enter in the search goes to the list (which selects its first row when none is selected). The Enter that ends an input
 * method's composition (Japanese, Chinese, Korean) and the repeats of a key held down are not it.
 *
 * @param event the key press
 */
function focusList(event: KeyboardEvent): void {
  if (!event.isComposing && !event.repeat) {
    document.getElementById('param-list')?.focus()
  }
}
</script>
