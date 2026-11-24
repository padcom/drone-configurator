<template>
  <nav class="param-groups" :aria-label="t('params.groups')" @keydown="move" @keydown.esc="leave">
    <!-- By the name or by the metadata's groups, when the metadata has groups. The arrows choose in it (radio buttons); the keys
         of the list of groups below are for the groups' buttons alone. -->
    <SegmentedControl
      v-if="grouping.available.value"
      id="param-group-by"
      class="group-by"
      :model-value="grouping.by.value"
      :label="t('params.groupBy.label')"
      :options="byOptions"
      @update:model-value="grouping.choose($event as GroupBy)"
    />
    <button
      v-for="group in all"
      :key="group.id"
      type="button"
      class="param-group"
      :class="{ chosen: group.id === current }"
      :aria-pressed="group.id === current ? 'true' : 'false'"
      :tabindex="group.id === stop ? 0 : -1"
      :data-group="group.id"
      :title="noteOf(group.id)"
      :aria-description="noteOf(group.id)"
      @click="pick(group.id)"
      @focus="focused = group.id"
    >
      <span>{{ labelOf(group.id) }}</span>
      <span class="count">{{ group.count }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { edge, step } from '@/lib/ui/menuKeys'
import { useFavourites } from '@/composables/favourites'
import { FAVOURITES_GROUP, RECENT_GROUP, effectiveGroup, groupsOf } from '@/lib/params/paramGroups'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { type GroupBy, useParamGrouping } from '@/composables/useParamGrouping'
import { useRecentParams } from '@/composables/recentParams'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamGroup } from '@/composables/useParamGroup'
import { useParamView } from '@/composables/useParamView'

// The groups of the parameter list, with how many parameters are in each ("All" first): a click shows only that group. The
// groups come from the parameters' names. A group that is no longer there (another vehicle) is as if All were chosen. There
// may be a hundred of them, so the list is one stop of the Tab key (the chosen group, or the one the arrows moved to) and
// Up, Down, Home and End move within it.
const { t } = useI18n()
const { fields, parameters } = useConfigurator()
const choice = useParamGroup()
// The counts are of what the view lists (Standard leaves out the advanced ones); the groups are all of them.
const { listed } = useParamView()
const grouping = useParamGrouping()
const byOptions = computed(() => [
  { value: 'name', label: t('params.groupBy.name') },
  { value: 'metadata', label: t('params.groupBy.metadata') },
])
const groups = computed(() => groupsOf(fields.params.value, listed.value, grouping.grouping.value))
// The favourites the vehicle has, and how many it does not (the group's count is the first, its tooltip says the second).
const favourites = useFavourites()
const present = computed(() => fields.params.value.filter(param => favourites.set.value.has(param.id)).length)
const missing = computed(() => favourites.names.value.length - present.value)
// The recently used that the vehicle has.
const recent = useRecentParams()
const onVehicle = computed(() => new Set(fields.params.value.map(param => param.id)))
const recentCount = computed(() => recent.names.value.filter(name => onVehicle.value.has(name)).length)
const all = computed(() => [
  { id: '', count: listed.value.length },
  { id: FAVOURITES_GROUP, count: present.value },
  { id: RECENT_GROUP, count: recentCount.value },
  ...groups.value,
])

/**
 * What is said of a group besides its name: for Favourites, how many of them this vehicle does not have (a tooltip, and a
 * description for a screen reader).
 *
 * @param id the group
 * @returns the words, or undefined
 */
function noteOf(id: string): string | undefined {
  return id === FAVOURITES_GROUP && missing.value > 0 ? t('params.favourites.notOnVehicle', { count: missing.value }) : undefined
}

/**
 * What a group is called in the list.
 *
 * @param id the group
 * @returns All, Favourites, Recently used, or the group's own name
 */
function labelOf(id: string): string {
  const named: Record<string, string> = {
    '': t('params.allGroups'),
    [FAVOURITES_GROUP]: t('params.favourites.group'),
    [RECENT_GROUP]: t('params.recent.group'),
  }

  return named[id] ?? id
}
const current = computed(() => effectiveGroup(fields.params.value, choice.chosen.value, grouping.grouping.value))
// The group the arrows moved the focus to; the one Tab stops at is that, else the chosen one (when it is in the list).
const focused = ref<string | null>(null)
const stop = computed(() => all.value.some(group => group.id === focused.value) ? focused.value : current.value)

/**
 * Chooses a group (by a click, or Enter or Space on its button). The search is cleared with it: a search for a name of another
 * group would leave the list empty. A search typed afterwards is kept.
 *
 * @param id the group, or an empty string for all
 */
function pick(id: string): void {
  parameters.setFilter('')
  choice.choose(id)
}

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
 * Escape leaves the groups for the list (the group list has no popup of its own for it to close first; a key something else
 * took is left alone).
 *
 * @param event the key press
 */
function leave(event: KeyboardEvent): void {
  if (!event.defaultPrevented) {
    document.getElementById('param-list')?.focus()
  }
}

/**
 * Up, Down, Home and End move the focus between the groups.
 *
 * @param event the key press
 */
function move(event: KeyboardEvent): void {
  const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button.param-group')]
  const from = buttons.indexOf(event.target as HTMLElement)
  if (!KEYS.has(event.key) || from < 0) {
    return
  }
  event.preventDefault()
  buttons[target(event.key, from)]?.focus()
}
</script>
