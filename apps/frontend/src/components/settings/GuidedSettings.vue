<template>
  <section class="settings-guided" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="settings-group">{{ t('guided.settings.title') }}</h3>
    <p class="muted">{{ t('guided.settings.help') }}</p>
    <div v-for="row in rows" :key="row.key" class="settings-row">
      <label :for="`${uid}-${row.key}`">{{ t(`guided.settings.labels.${row.key}`) }}</label>
      <Select
        :id="`${uid}-${row.key}`"
        :model-value="row.value"
        :options="row.options"
        :aria-describedby="`${uid}-${row.key}-help`"
        @update:model-value="choose(row.key, $event)"
      />
      <p :id="`${uid}-${row.key}-help`" class="muted">{{ t(`guided.settings.helps.${row.key}`) }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
// "Guided control" in Settings: how a Go here is confirmed (none, plain: the default, or a hold), what to do when the
// vehicle's GCS failsafe
// is off (block: the default, or warn), and how high, how far from home and how fast a command may go and at what speed a Go
// here flies.
// The backend holds the numbers to its own hard limits, and the vehicle's fence is lower still when it limits them.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/ui/Select.vue'
import { type GuidedKey, useGuidedPreferences } from '@/composables/useGuidedPreferences'
import { MAX_ALTITUDES, MAX_DISTANCES, MAX_SPEEDS, SPEEDS } from '@/lib/fly/guided'

const { t } = useI18n()
const uid = useId()
const { prefs, choose } = useGuidedPreferences()

/** One line of the settings. */
interface Row {
  key: GuidedKey
  value: string
  options: { value: string, label: string }[]
}

/**
 * The choices of a number, with their unit.
 *
 * @param numbers what can be chosen
 * @param unit the message of the unit
 * @returns the options
 */
function choicesOf(numbers: readonly number[], unit: string): { value: string, label: string }[] {
  return numbers.map(n => ({ value: String(n), label: t(unit, { n }) }))
}

/**
 * The choices that are words, each said by its own message.
 *
 * @param key which setting
 * @param values what can be chosen
 * @returns the options
 */
function words(key: GuidedKey, values: readonly string[]): { value: string, label: string }[] {
  return values.map(value => ({ value, label: t(`guided.settings.words.${key}.${value}`) }))
}

const rows = computed<Row[]>(() => [
  { key: 'confirmation', value: prefs.value.confirmation, options: words('confirmation', ['none', 'plain', 'hold']) },
  { key: 'failsafe', value: prefs.value.failsafe, options: words('failsafe', ['block', 'warn']) },
  { key: 'maxAltitude', value: String(prefs.value.maxAltitude), options: choicesOf(MAX_ALTITUDES, 'settings.flight.metres') },
  { key: 'maxDistance', value: String(prefs.value.maxDistance), options: choicesOf(MAX_DISTANCES, 'settings.flight.metres') },
  { key: 'maxSpeed', value: String(prefs.value.maxSpeed), options: choicesOf(MAX_SPEEDS, 'guided.settings.perSecond') },
  { key: 'speed', value: String(prefs.value.speed), options: choicesOf(SPEEDS, 'guided.settings.perSecond') },
])
</script>
