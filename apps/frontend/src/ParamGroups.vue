<template>
  <nav class="param-groups" :aria-label="t('params.groups')" @keydown="move">
    <button
      v-for="group in all"
      :key="group.id"
      type="button"
      class="param-group"
      :class="{ chosen: group.id === current }"
      :aria-pressed="group.id === current ? 'true' : 'false'"
      :tabindex="group.id === stop ? 0 : -1"
      :data-group="group.id"
      @click="choice.choose(group.id)"
      @focus="focused = group.id"
    >
      <span>{{ group.id === '' ? t('params.allGroups') : group.id }}</span>
      <span class="count">{{ group.count }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { edge, step } from './kit/menuKeys'
import { effectiveGroup, groupsOf } from './paramGroups'
import { useConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

// The groups of the parameter list, with how many parameters are in each ("All" first): a click shows only that group. The
// groups come from the parameters' names. A group that is no longer there (another vehicle) is as if All were chosen. There
// may be a hundred of them, so the list is one stop of the Tab key (the chosen group, or the one the arrows moved to) and
// Up, Down, Home and End move within it.
const { t } = useI18n()
const { fields } = useConfigurator()
const choice = useParamGroup()
const groups = computed(() => groupsOf(fields.params.value))
const all = computed(() => [{ id: '', count: fields.params.value.length }, ...groups.value])
const current = computed(() => effectiveGroup(fields.params.value, choice.chosen.value))
// The group the arrows moved the focus to; the one Tab stops at is that, else the chosen one (when it is in the list).
const focused = ref<string | null>(null)
const stop = computed(() => all.value.some(group => group.id === focused.value) ? focused.value : current.value)

const KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

/**
 * Where a key sends the focus.
 *
 * @param key the key
 * @param from the index of the group that has the focus
 * @returns the index to move to
 */
function target(key: string, from: number): number {
  const items = all.value.map(group => ({ id: group.id, label: group.id }))
  const moves: Record<string, () => number> = {
    Home: () => edge(items, 'first'),
    End: () => edge(items, 'last'),
    ArrowDown: () => step(items, from, 1),
    ArrowUp: () => step(items, from, -1),
  }

  return moves[key]?.() ?? from
}

/**
 * Up, Down, Home and End move the focus between the groups.
 *
 * @param event the key press
 */
function move(event: KeyboardEvent): void {
  const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')]
  const from = buttons.indexOf(event.target as HTMLElement)
  if (!KEYS.has(event.key) || from < 0) {
    return
  }
  event.preventDefault()
  buttons[target(event.key, from)]?.focus()
}
</script>
