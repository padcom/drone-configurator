<template>
  <div class="plan-tools" role="tablist" :aria-label="t('plan.tool.label')" @keydown="move">
    <button
      v-for="entry in TOOLS"
      :id="`plan-tab-${entry}`"
      :key="entry"
      type="button"
      role="tab"
      class="plan-tool"
      :aria-selected="tool === entry"
      :aria-controls="`plan-panel-${entry}`"
      :tabindex="tool === entry ? 0 : -1"
      @click="state.setTool(entry)"
    >
      {{ t(`plan.tool.${entry}`) }}
    </button>
  </div>
</template>

<script setup lang="ts">
// The tools of the Plan page, as tabs over its main area: the mission on the map, and the table of its items. The tabs are one
// tab stop (the one that is shown); the arrows, Home and End move to another tool and show it, as the tabs of a window do.
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { type PlanTool, usePlan } from '@/composables/usePlan'

const TOOLS: readonly PlanTool[] = ['mission', 'table']

/** The tool each key goes to from the one shown. */
const GOES: Record<string, (at: number) => number> = {
  ArrowRight: at => at + 1,
  ArrowLeft: at => at - 1,
  Home: () => 0,
  End: () => TOOLS.length - 1,
}

const { t } = useI18n()
const state = usePlan()
const { tool } = state

/**
 * Whether a key is pressed with a modifier (the browser's and the system's shortcuts are not the tabs').
 *
 * @param event the key event
 * @returns true when it is
 */
function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

/**
 * The tool a key goes to from the one shown (round the ends).
 *
 * @param key the key
 * @returns the tool, or null for a key that does not move
 */
function toolAfter(key: string): PlanTool | null {
  const goes = GOES[key]

  return goes ? TOOLS[(goes(TOOLS.indexOf(tool.value)) + TOOLS.length) % TOOLS.length] ?? null : null
}

/**
 * Moves to another tool with the arrow keys, Home and End (round the ends), and the focus with it.
 *
 * @param event the key
 */
async function move(event: KeyboardEvent): Promise<void> {
  const next = hasModifier(event) ? null : toolAfter(event.key)

  if (next) {
    event.preventDefault()
    state.setTool(next)
    await nextTick()
    document.getElementById(`plan-tab-${next}`)?.focus()
  }
}
</script>
