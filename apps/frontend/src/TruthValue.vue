<template>
  <div class="truth" :class="[state, { hatched }]" :data-state="state">
    <div class="head">
      <span class="label">{{ label }}</span>
      <span v-if="note" class="note">{{ note }}</span>
    </div>
    <div class="value">{{ shown }}</div>
    <div v-if="help" class="help">{{ help }}</div>
  </div>
</template>

<script setup lang="ts">
// A value from the vehicle with the truth about it, in five states that always say so in words (and the stale ones with a
// pattern): live (reported within 3 s), stale (older), last heard (the link is lost: kept, not current), never reported
// (a dash, never a made-up zero) and a verified write (success only once the vehicle has read the value back).
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  /** What the value is ("BATTERY"). */
  label: string
  /** Which of the five it is in. */
  state: 'live' | 'stale' | 'last-heard' | 'never' | 'verified'
  /** The value as it is to be read, with its unit. Ignored when it was never reported. */
  value?: string
  /** How old a stale value is, in milliseconds. */
  ageMs?: number
  /** A line under the value (what the state means, or the field's own help). */
  help?: string
}>()

const { t } = useI18n()

const hatched = computed(() => props.state === 'stale' || props.state === 'last-heard')

/** The value; a dash when it was never reported, whatever was passed (nothing is made up). */
const shown = computed(() => props.state === 'never' || props.value === undefined ? t('truth.never') : props.value)

/** The words of the states that have a fixed note (a stale value's has its age in it; a live or unreported one has none). */
const NOTES: Partial<Record<typeof props.state, string>> = { 'last-heard': 'truth.lastHeard', 'verified': 'truth.verified' }

/** The words that say which state it is in, for the states that are not plain. */
const note = computed(() => {
  if (props.state === 'stale') {
    return t('truth.stale', { seconds: Math.round((props.ageMs ?? 0) / 1000) })
  }
  const key = NOTES[props.state]

  return key ? t(key) : ''
})
</script>
