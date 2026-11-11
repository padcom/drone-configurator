<template>
  <div class="kit-tabs">
    <div class="tablist" role="tablist" :aria-label="label" @keydown="move">
      <button
        v-for="tab in tabs"
        :id="tabId(tab.id)"
        :key="tab.id"
        class="tab"
        type="button"
        role="tab"
        :aria-selected="tab.id === current ? 'true' : 'false'"
        :aria-controls="panelId(tab.id)"
        :tabindex="tab.id === current ? 0 : -1"
        @click="model = tab.id"
      >{{ tab.label }}</button>
    </div>
    <div
      v-for="tab in tabs"
      :id="panelId(tab.id)"
      :key="tab.id"
      class="panel"
      role="tabpanel"
      tabindex="0"
      :aria-labelledby="tabId(tab.id)"
      :hidden="tab.id !== current"
    ><slot :name="tab.id" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { isPlainKey } from '@/lib/ui/keys'

// Tabs, as the ARIA authoring practices have them: one tab is in the tab order (the chosen one), the arrow keys move
// to the next or the previous tab and choose it, Home and End go to the first and the last, and the panel of a tab
// that is not chosen is hidden but kept, so what is in it stays. The panel of a tab is the slot with its id. Keys with
// Alt, Ctrl or Meta are not the tabs': Alt+Left and Alt+Right are the browser's Back and Forward.
const model = defineModel<string>({ default: '' })
const base = useId()

const props = defineProps<{
  /** The name of the group of tabs for a screen reader. */
  label: string
  /** The tabs, in order; each has the slot of its panel. */
  tabs: { id: string, label: string }[]
}>()

/** The tab in effect: the chosen one, or the first when the model names none, so the tabs can always be reached. */
const current = computed(() => props.tabs.some(tab => tab.id === model.value) ? model.value : (props.tabs[0]?.id ?? ''))

/** Where each key goes, from the tab it is pressed on, among `count` tabs. */
const MOVES: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
}

const tabId = (id: string) => `${base}-tab-${id}`
const panelId = (id: string) => `${base}-panel-${id}`

/**
 * Chooses the tab at `index` and puts the focus on it.
 *
 * @param buttons the tabs' buttons, in order
 * @param index which one
 */
function choose(buttons: HTMLElement[], index: number): void {
  model.value = props.tabs[index]?.id ?? model.value
  buttons[index]?.focus()
}

/**
 * Moves to another tab with the arrow keys, Home or End, and chooses it.
 *
 * @param event the key press, in the list of tabs
 */
function move(event: KeyboardEvent): void {
  const go = isPlainKey(event) ? MOVES[event.key] : undefined
  const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')]
  const from = buttons.indexOf(event.target as HTMLElement)
  if (!go || from < 0) {
    return
  }
  event.preventDefault()
  choose(buttons, go(from, buttons.length))
}
</script>
