<template>
  <nav class="setup-nav" :aria-label="t('setup.sections')">
    <RouterLink class="setup-nav-home" :to="{ name: sectionRouteName('setup', 'home') }">
      {{ t('setup.section.home') }}
    </RouterLink>
    <section v-for="group in GROUPS" :key="group.id" class="setup-nav-group">
      <h3 class="setup-label">{{ t(`setup.group.${group.id}`) }}</h3>
      <RouterLink v-for="id in group.sections" :key="id" class="setup-nav-link" :to="{ name: sectionRouteName('setup', id) }">
        <span>{{ t(`setup.section.${id}`) }}</span>
        <!-- The mark is a glyph and, for a screen reader, words: the colour only adds to them. -->
        <span v-if="mark(id)" class="setup-mark" :class="mark(id)?.state" aria-hidden="true">{{ mark(id)?.glyph }}</span>
        <span v-if="mark(id)" class="visually-hidden">{{ mark(id)?.words }}</span>
      </RouterLink>
    </section>
  </nav>
</template>

<script setup lang="ts">
// The list of the Setup pages, in the groups of the design: get flying, connections and devices, the vehicle. A page of the
// get-flying group that the parameters can say something of is marked: "!" when they are at the defaults of a vehicle that was
// never set up, a tick when they are not (never "verified": it is read from parameters), a dash when it cannot be told.
import { useI18n } from 'vue-i18n'
import { sectionRouteName } from '@/screens/registry'
import type { Status, StepState } from '@/lib/setup/setupStatus'

const props = defineProps<{
  /** What the parameters say of each step. */
  status: Status
}>()

const { t } = useI18n()

/** The pages in the nav, by group. */
const GROUPS = [
  { id: 'fly', sections: ['frame', 'accel', 'compass', 'radio', 'motors', 'modes', 'failsafes', 'battery'] },
  { id: 'connections', sections: ['serial', 'devices'] },
  { id: 'vehicle', sections: ['info'] },
] as const

const GLYPH: Record<StepState, string> = { done: '✓', open: '!', unknown: '–' }

/**
 * The mark of a page: its step's state, as a glyph and in words.
 *
 * @param id the page
 * @returns the mark, or undefined for a page with no step
 */
function mark(id: string): { state: StepState, glyph: string, words: string } | undefined {
  const step = props.status.steps.find(candidate => candidate.id === id)

  return step ? { state: step.state, glyph: GLYPH[step.state], words: t(`setup.state.${step.state}`) } : undefined
}
</script>
