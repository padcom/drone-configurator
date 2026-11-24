<template>
  <div class="field-status" :class="{ compact }" :data-status="status">
    <p :id="statusId" class="status" :class="[status, { 'visually-hidden': quiet }]" :title="compact ? words : undefined">
      <Icon v-if="mark !== undefined" :name="mark" />
      <span>{{ words }}</span>
    </p>
    <div v-if="status === 'conflict'" class="conflict-box" role="alert">
      <p>{{ t('field.conflict.text', { name, vehicle: said(facts.vehicle), draft: said(facts.draft) }) }}</p>
      <div class="actions">
        <Button @click="emit('keep')">{{ t('field.conflict.keep') }}</Button>
        <Button @click="emit('take')">{{ t('field.conflict.take') }}</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// What a field bound to a parameter says of it, in words (lib/params/fieldState.ts): the vehicle's value, modified (and what the
// vehicle has), a write under way, verified by a read back, rejected (and why), or a CONFLICT, where the vehicle changed the
// parameter under a draft: then a box asks whether to keep the draft or take the vehicle's new value. The control is the
// screen's own (ParamField's number, choice or bits; a Tune slider): this only says, and tells what the person chose.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Icon from '@/components/ui/Icon.vue'
import { type FieldFacts, type FieldStatus, shownValue, statusOf } from '@/lib/params/fieldState'
import type { IconName } from '@/lib/ui/icons'

const props = withDefaults(defineProps<{
  /** What the field is called, in the conflict's words. */
  name: string
  /** What the vehicle holds, the draft, what the vehicle held when it was begun, and where the write is. */
  facts: FieldFacts
  /** A value as the field shows it (with its unit). */
  show: (value: number) => string
  /** Why the vehicle rejected the write (said with the `rejected` status). */
  rejection?: string
  /** The id of the line of words, for the control's `aria-describedby`. */
  statusId?: string
  /**
   * For a dense layout (a table of fields): the line takes no room while the field shows the vehicle's value (it is still read
   * out), and is one line, cut with an ellipsis, when it says more (the whole of it is its title).
   */
  compact?: boolean
}>(), {
  rejection: undefined,
  statusId: undefined,
  compact: false,
})

const emit = defineEmits<{
  /** The person keeps the draft over what the vehicle changed. */
  keep: []
  /** The person takes the vehicle's new value: the draft is dropped. */
  take: []
}>()

const { t } = useI18n()
const status = computed<FieldStatus>(() => statusOf(props.facts))

/** The icon that goes with a status, for the ones that are good or bad news (the words say it too: a colour is never all). */
const MARKS: Partial<Record<FieldStatus, IconName>> = {
  verified: 'check',
  rejected: 'warning',
  conflict: 'warning',
  draft: 'info',
}
const mark = computed(() => MARKS[status.value])
/** A compact line with nothing to add to the field: the vehicle's value (or none yet) is what the field already shows. */
const quiet = computed(() => props.compact && (status.value === 'vehicle' || status.value === 'unknown'))

/**
 * A value as the field shows it.
 *
 * @param value the value
 * @returns the text, or a dash for none
 */
function said(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : props.show(value)
}

/** The words of the status. */
const words = computed(() => {
  const reason = props.rejection ?? t('field.status.noReason')

  return t(`field.status.${status.value}`, { vehicle: said(props.facts.vehicle), value: said(shownValue(props.facts)), reason })
})
</script>
