<template>
  <section
    class="plan-detail"
    :aria-labelledby="item ? 'plan-detail-title' : undefined"
    :aria-label="item ? undefined : t('plan.detail.none')"
  >
    <p v-if="!item || !def" class="muted">{{ t('plan.detail.empty') }}</p>
    <template v-else>
      <h2 id="plan-detail-title" class="plan-detail-title">
        {{ t('plan.detail.title', { number, name: t(`plan.cmd.${def.id}`) }) }}
      </h2>
      <template v-if="def.place !== 'none'">
        <label class="plan-field" for="plan-lat">
          <span>{{ t('plan.detail.lat') }}</span>
          <PlanNumber
            id="plan-lat"
            :model-value="item.lat"
            :invalid="placeInvalid"
            @update:model-value="set({ lat: $event })"
          />
        </label>
        <label class="plan-field" for="plan-lon">
          <span>{{ t('plan.detail.lon') }}</span>
          <PlanNumber
            id="plan-lon"
            :model-value="item.lon"
            :invalid="placeInvalid"
            @update:model-value="set({ lon: $event })"
          />
        </label>
        <p v-if="def.place === 'optional'" class="muted">{{ t('plan.detail.hereHint') }}</p>
      </template>
      <template v-if="def.altitude">
        <label class="plan-field" for="plan-alt">
          <span>{{ t('plan.detail.alt') }}</span>
          <PlanNumber
            id="plan-alt"
            :model-value="item.alt"
            :invalid="has('noAltitude')"
            @update:model-value="set({ alt: $event })"
          />
        </label>
        <p v-if="keptAlt !== null" class="muted" data-testid="kept-alt">
          {{ t('plan.detail.keepsAlt', { value: keptAlt }) }}
        </p>
        <label class="plan-field" for="plan-frame">
          <span>{{ t('plan.detail.frame') }}</span>
          <Select
            id="plan-frame"
            :model-value="String(item.frame)"
            :options="frames"
            @update:model-value="set({ frame: Number($event) })"
          />
        </label>
      </template>
      <template v-for="field in def.fields" :key="field.id">
        <label class="plan-field" :for="`plan-field-${field.id}`">
          <span>{{ t(field.labelKey) }}<template v-if="field.unit"> ({{ field.unit }})</template></span>
          <Select
            v-if="field.kind === 'choice'"
            :id="`plan-field-${field.id}`"
            :model-value="String(field.read(item))"
            :options="choicesOf(field)"
            @update:model-value="set(field.write(item, Number($event)))"
          />
          <PlanNumber
            v-else
            :id="`plan-field-${field.id}`"
            :model-value="field.read(item)"
            :invalid="invalidField(field.id)"
            @update:model-value="set(field.write(item, $event))"
          />
        </label>
        <p v-if="kept(field) !== null" class="muted" data-testid="kept">{{ t('plan.detail.keeps', { value: kept(field) }) }}</p>
      </template>
      <p v-if="problems.length > 0" class="plan-detail-problems" role="status">
        <span v-for="problem in problems" :key="problem.key + (problem.params?.field ?? '')">{{ problemText(problem) }}</span>
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
// The form of the selected item: its place and altitude, and the fields its command has (the catalog). Where the vehicle keeps
// than it is given (a hold time as a whole number of seconds, an altitude to the centimetre) the form says what it keeps.
// Every change is an edit of the plan's history, so Undo takes it back.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/ui/Select.vue'
import { usePlan } from '@/composables/usePlan'
import { type Field, definitionOf, keptAltitude, keptValue } from '@/lib/plan/catalog'
import { FRAME_ABOVE_HOME, FRAME_ABSOLUTE, FRAME_TERRAIN, type PlanItem } from '@/lib/plan/model'
import type { Problem } from '@/lib/plan/validate'
import PlanNumber from './PlanNumber.vue'
import { problemWords } from './problemWords'

const { t } = useI18n()
const state = usePlan()
const { item } = state
const def = computed(() => (item.value ? definitionOf(item.value.command) : undefined))
const number = computed(() => state.plan.value.items.findIndex(candidate => candidate.id === item.value?.id) + 1)
const problems = computed(() => state.problems.value.filter(problem => problem.itemId === (item.value?.id ?? -1)))
const placeInvalid = computed(() => problems.value.some(problem => ['noPlace', 'offGlobe'].includes(problem.key)))
const keptAlt = computed(() => keptAltitude(item.value?.alt ?? null))
const frames = computed(() => [
  { value: String(FRAME_ABOVE_HOME), label: t('plan.frame.home') },
  { value: String(FRAME_ABSOLUTE), label: t('plan.frame.sea') },
  { value: String(FRAME_TERRAIN), label: t('plan.frame.terrain') },
])

/**
 * Whether the plan says something is wrong of the item, by the key of the problem.
 *
 * @param key the problem's key
 * @returns whether it does
 */
function has(key: string): boolean {
  return problems.value.some(problem => problem.key === key)
}

/**
 * Whether the plan says a field of the item is wrong.
 *
 * @param id the field's id
 * @returns whether it does
 */
function invalidField(id: string): boolean {
  return problems.value.some(problem => problem.params?.field === id)
}

/**
 * The choices of a field, with their words.
 *
 * @param field the field
 * @returns the options of the select
 */
function choicesOf(field: Field): { value: string, label: string }[] {
  return (field.choices ?? []).map(choice => ({ value: String(choice.value), label: t(choice.labelKey) }))
}

/**
 * What the vehicle keeps of what a field holds, when that is not what it holds.
 *
 * @param field the field
 * @returns the value the vehicle keeps, or null
 */
function kept(field: Field): number | null {
  return item.value ? keptValue(field, field.read(item.value)) : null
}

/**
 * The words of a problem of the item.
 *
 * @param problem the problem
 * @returns its message
 */
function problemText(problem: Problem): string {
  return problemWords(problem, item.value ?? undefined, t)
}

/**
 * Changes the item.
 *
 * @param patch what changes
 */
function set(patch: Partial<PlanItem>): void {
  if (item.value) {
    state.update(item.value.id, patch)
  }
}
</script>
