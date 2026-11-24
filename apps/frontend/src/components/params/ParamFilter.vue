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
      @keydown.esc="clearSearch"
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
  <CommandButton id="refresh" command="params.download" icon-position="left" icon-only />
</template>

<script setup lang="ts">
import { nextTick, onActivated, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import Icon from '@/components/ui/Icon.vue'
import { moveListSelection } from '@/lib/params/paramListNav'
import { focusSearch } from '@/lib/params/paramShortcuts'
import { takeFocus } from '@/composables/useFocusIntent'
import { useConfigurator } from '@/composables/useConfigurator'
import { useRecentParams } from '@/composables/recentParams'

// The search by name, with a way to clear it, and the button that downloads the list again.
const { t } = useI18n()
const { parameters, fields } = useConfigurator()
const recent = useRecentParams()

/** A command that went to this screen asked for the focus to be in the search box: it goes there once the box is shown. */
async function takeAskedFocus(): Promise<void> {
  await nextTick()

  if (takeFocus('params.search')) {
    focusSearch()
  }
}

onMounted(takeAskedFocus)
onActivated(takeAskedFocus)

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

/** The result the search opened is one of the recently used (an Enter with nothing typed opens nothing). */
function openSelected(): void {
  const opened = fields.selected.value
  if (opened !== null && fields.filter.value.trim() !== '') {
    void recent.touch(opened)
  }
}

/**
 * Enter in the search opens the selected result (the top one, unless the arrows moved): the focus goes to the list on it (which
 * selects its first row when none is selected), and it is one of the recently used. The Enter that ends an input method's
 * composition (Japanese, Chinese, Korean) and the repeats of a key held down are not it.
 *
 * @param event the key press
 */
function focusList(event: KeyboardEvent): void {
  if (!event.isComposing && !event.repeat) {
    document.getElementById('param-list')?.focus()
    openSelected()
  }
}

/**
 * Escape in the search clears it (the whole list comes back, the focus stays). With nothing typed the key is left to the rest of
 * the page.
 *
 * @param event the key press
 */
function clearSearch(event: KeyboardEvent): void {
  if (fields.filter.value !== '' && !event.isComposing) {
    event.preventDefault()
    event.stopPropagation()
    parameters.setFilter('')
  }
}
</script>
