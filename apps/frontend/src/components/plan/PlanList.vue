<template>
  <section class="plan-list" :aria-label="t('plan.list.label')">
    <div class="plan-list-bar">
      <CommandButton command="plan.addWaypoint" look="primary" icon-position="none" />
      <label class="plan-add-other">
        <span class="visually-hidden">{{ t('plan.list.other') }}</span>
        <Select :key="resets" :model-value="''" :options="others" @update:model-value="addOther" />
      </label>
      <CommandButton command="plan.duplicate" icon-position="none" />
      <CommandButton command="plan.delete" icon-position="none" />
      <CommandButton command="plan.moveUp" icon-position="none" />
      <CommandButton command="plan.moveDown" icon-position="none" />
    </div>
    <EmptyState v-if="plan.items.length === 0" :title="t('plan.list.emptyTitle')" :help="t('plan.list.emptyHelp')" :level="3" />
    <ol v-else ref="listElement" class="plan-items" @keydown="step">
      <li v-for="(entry, index) in plan.items" :key="entry.id">
        <button
          type="button"
          class="plan-item"
          :class="{ selected: entry.id === selected, problem: hasProblem(entry.id) }"
          :aria-pressed="entry.id === selected"
          :tabindex="isTabStop(entry.id, index) ? 0 : -1"
          @click="state.select(entry.id)"
        >
          <span class="no">{{ index + 1 }}</span>
          <span class="name">{{ nameOf(entry) }}</span>
          <span class="value">{{ summaryOf(entry) }}</span>
        </button>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
// The items of the plan, in order, the selected one marked: a number, what it is and its main value (its altitude, or what its
// command does). The commands that work on the selected item are buttons here and in the palette (the same commands).
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import { usePlan } from '@/composables/usePlan'
import { COMMANDS, definitionOf } from '@/lib/plan/catalog'
import type { PlanItem } from '@/lib/plan/model'
import { summaryOf } from '@/lib/plan/summary'

const { t } = useI18n()
const state = usePlan()
const { plan, selected } = state
const resets = ref(0)
const listElement = ref<HTMLElement | null>(null)
const withProblem = computed(() => new Set(
  state.problems.value.filter(problem => problem.level === 'error').map(problem => problem.itemId),
))
// Every command but the waypoint (it has its own button) can be added from the list.
const others = computed(() => [
  { value: '', label: t('plan.list.other') },
  ...COMMANDS.filter(def => def.command !== 16).map(def => ({ value: String(def.command), label: t(`plan.cmd.${def.id}`) })),
])

/**
 * Adds an item of the command chosen in the list of the other commands.
 *
 * @param value the command's number, as text ('' for the heading)
 */
function addOther(value: string): void {
  if (value !== '') {
    state.add(Number(value))
    // (the list shows its heading again: a new select, since what it holds did not change as far as the page knows)
    resets.value += 1
  }
}

/**
 * Whether an item is the one the Tab key stops at: the selected one, or the first when none is (a list of 2000 items is one tab
 * stop, and the arrow keys move in it).
 *
 * @param id the item's id
 * @param index its place in the list
 * @returns whether it is the tab stop
 */
function isTabStop(id: number, index: number): boolean {
  return selected.value === null ? index === 0 : id === selected.value
}

/** How far each key moves the selection: one item up or down, or to the first or the last. */
const STEPS: Record<string, (at: number, last: number) => number> = {
  ArrowDown: at => at + 1,
  ArrowUp: at => at - 1,
  Home: () => 0,
  End: (_at, last) => last,
}

/**
 * The item a key moves the selection to, if it is a key that moves it.
 *
 * @param key the key
 * @param at the place (from 0) the key was pressed at
 * @returns the item, or undefined
 */
function itemAfter(key: string, at: number): PlanItem | undefined {
  const move = STEPS[key]
  const last = plan.value.items.length - 1

  return move ? plan.value.items[Math.min(Math.max(move(at, last), 0), last)] : undefined
}

/**
 * The place (from 0) of the row a key was pressed on, which is where the keys move from; the selected item when the key was not
 * pressed on a row.
 *
 * @param event the key
 * @returns the place in the list, or -1
 */
function rowOf(event: KeyboardEvent): number {
  const rows = [...(listElement.value?.querySelectorAll('.plan-item') ?? [])]
  const at = rows.indexOf((event.target as HTMLElement).closest('.plan-item') as Element)

  return at >= 0 ? at : plan.value.items.findIndex(item => item.id === selected.value)
}

/**
 * Moves the selection with the arrow keys, Home and End, and the focus with it.
 *
 * @param event the key
 */
async function step(event: KeyboardEvent): Promise<void> {
  const next = itemAfter(event.key, rowOf(event))
  if (next) {
    event.preventDefault()
    state.select(next.id)
    await nextTick()
    listElement.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
  }
}

/**
 * Whether the plan says an error of an item.
 *
 * @param id the item's id
 * @returns whether it does
 */
function hasProblem(id: number): boolean {
  return withProblem.value.has(id)
}

/**
 * What an item is called.
 *
 * @param item the item
 * @returns its name
 */
function nameOf(item: PlanItem): string {
  const def = definitionOf(item.command)

  return def ? t(`plan.cmd.${def.id}`) : String(item.command)
}

</script>
