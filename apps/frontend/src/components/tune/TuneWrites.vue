<template>
  <section class="tune-writes" :aria-labelledby="`${uid}-heading`">
    <h2 :id="`${uid}-heading`" class="setup-label">{{ t('setup.writes') }}</h2>
    <!-- The values that will be written, as the Parameters page lists its changes: the name, what the vehicle has now and what
         it will have. A value that is refused is not part of the write: it is shown as refused, and the write is held until
         fixed. -->
    <ul class="tune-write-list">
      <li v-for="row in rows" :key="row.id" class="tune-write-row" :data-id="row.id">
        <span class="name">{{ row.id }}</span>
        <span class="values">
          <span class="from">{{ row.from }}</span>
          →
          <span class="to">{{ row.to }}</span>
        </span>
      </li>
      <li v-for="id in refusedIds" :key="id" class="tune-write-row refused">
        <span class="name">{{ id }}</span>
        <span class="values">{{ t('setup.refusedValue') }}</span>
      </li>
    </ul>
    <Button :id="`${idPrefix}-write`" variant="primary" :disabled="!writable" @click="panel.write()">{{ label }}</Button>
  </section>
</template>

<script setup lang="ts">
// "What this writes" of a Tune part, in the fixed bottom of its aside: the parameters that have a change, each with the value the
// vehicle has and the value it will have (as the changes of the Parameters page are listed), and the Write button. The list
// scrolls in a box of its own when there are many, so that the button stays in view. The question that Write asks names them all.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import { usePanelWrite } from '@/composables/usePanelWrite'
import type { ParamPanel } from '@/composables/useParamPanel'
import { showNumber } from '@/lib/params/paramValue'

const props = defineProps<{
  /** The part's parameters. */
  panel: ParamPanel
  /** A prefix for the ids of the parts, so that a page's own checks can find them. */
  idPrefix: string
  /** The page has a reason of its own not to write (a value beyond the hard limit). */
  hold?: boolean
  /** The changed parameters whose value is refused: they are shown as refused and are not part of the write. */
  refusedIds?: readonly string[]
}>()

const { t } = useI18n()
const uid = useId()
const { writable, label } = usePanelWrite(() => props.panel, () => props.hold)
const refusedIds = computed(() => props.refusedIds ?? [])

/**
 * A value as the page shows it: the shortest text that says it, or a dash for a value that is not known.
 *
 * @param value the value
 * @returns the text
 */
function shown(value: number | null): string {
  return value === null ? '–' : showNumber(value)
}

const rows = computed(() => props.panel.dirty.value.filter(id => !refusedIds.value.includes(id)).map(id => ({
  id,
  from: shown(props.panel.vehicleValue(id)),
  to: shown(props.panel.value(id)),
})))
</script>
