<template>
  <section class="plan-validity" :class="{ bad: errors > 0 }" :aria-label="t('plan.problem.label')">
    <p class="plan-validity-title" role="status">{{ title }}</p>
    <ul v-if="problems.length > 0" class="plan-problems">
      <li v-for="(problem, index) in problems" :key="index" :class="problem.level">
        <button v-if="problem.itemId !== null" type="button" @click="state.select(problem.itemId)">
          {{ text(problem) }}
        </button>
        <span v-else>{{ text(problem) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// The design's validity header: whether the plan is fit to be written, and what is wrong with it, each problem naming its item
// (a press selects it). Errors would stop a write; a warning is worth a look and does not. Nothing is written from here yet.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlan } from '@/composables/usePlan'
import type { Problem } from '@/lib/plan/validate'
import { problemLine } from './problemWords'

const { t } = useI18n()
const state = usePlan()
const { problems } = state
const errors = computed(() => problems.value.filter(problem => problem.level === 'error').length)
const title = computed(() => {
  if (state.plan.value.items.length === 0) {
    // (an empty plan has no problem, and is not fit to be written either: a write of it is refused)
    return t('plan.problem.empty')
  }
  if (problems.value.length === 0) {
    return t('plan.problem.none')
  }

  if (errors.value > 0) {
    return t('plan.problem.errors', { count: errors.value })
  }

  return t('plan.problem.warnings', { count: problems.value.length })
})

/**
 * The words of a problem, with the item's number in front when it is about an item.
 *
 * @param problem the problem
 * @returns the line
 */
function text(problem: Problem): string {
  const item = state.plan.value.items.find(candidate => candidate.id === problem.itemId)

  return problemLine(problem, item, t)
}
</script>
