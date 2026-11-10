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
      @keydown="moveSelection"
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
import { moveListSelection } from './paramListNav'
import { useConfigurator } from './useConfigurator'

// The search by name, with a way to clear it, and the button that downloads the list again.
const { t } = useI18n()
const { parameters, fields } = useConfigurator()
// Not while a write is under way: a download in the middle of it would put half-written values in the initial ones.
const download = computed(() => canDownload(fields.connection.value.state, fields.list.value) && !parameters.lock.busy.value)

/** The keys that move the selected row of the list from the search (Home and End are the caret's). */
const LIST_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'])

/**
 * Up, Down, Page Up and Page Down in the search move the selected row of the list (scrolled into view), and the focus stays
 * here so that the typing goes on; the caret does not move. Not with a modifier (Shift extends the selection of the text), not
 * during an input method's composition (the keys choose among its candidates), and not when the list has no rows.
 *
 * @param event the key press
 */
function moveSelection(event: KeyboardEvent): void {
  const taken = [event.altKey, event.ctrlKey, event.metaKey, event.shiftKey, event.isComposing, !LIST_KEYS.has(event.key)]
  if (!taken.some(Boolean) && moveListSelection(event.key)) {
    event.preventDefault()
  }
}

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
