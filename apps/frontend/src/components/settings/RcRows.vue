<template>
  <div class="rc-rows">
    <p v-if="mapping.refusal.value !== null" id="rc-refusal" class="rc-warn" role="status">
      {{ t(`settings.rc.refused.${mapping.refusal.value.code}`, { channel: mapping.refusal.value.channel }) }}
    </p>
    <ul class="rc-list">
      <template v-for="slot in slots" :key="slot.channel">
        <li v-if="slot.entries.length === 0" class="rc-row rc-free" :data-testid="`rc-free-${slot.channel}`">
          <div class="rc-row-head">
            <span class="rc-kind">{{ t('settings.rc.vehicleChannel', { n: slot.channel }) }}</span>
            <span class="muted">{{ t('settings.rc.own') }}</span>
            <Button :id="`${uid}-add-${slot.channel}`" @click="mapping.add(slot.channel)">
              {{ t('settings.rc.addRow') }}
            </Button>
          </div>
        </li>
        <li v-for="{ row, index } in slot.entries" :key="index" class="rc-row" :data-testid="`rc-row-${index}`">
          <div class="rc-row-head">
            <span class="rc-kind">{{ t('settings.rc.vehicleChannel', { n: row.channel }) }}</span>
            <label :for="`${uid}-channel-${index}`">{{ t('settings.rc.channel') }}</label>
            <Select
              :id="`${uid}-channel-${index}`"
              :model-value="String(row.channel)"
              :options="channels"
              @update:model-value="(next: string) => mapping.setChannel(index, Number(next))"
              @change="(event: Event) => showChannel(index, event)"
            />
            <span class="rc-source">{{ sourceText(row) }}</span>
            <Button v-if="mapping.capturing.value !== index" :id="`${uid}-move-${index}`" @click="mapping.capture(index)">
              {{ t('settings.rc.moveIt') }}
            </Button>
            <Button v-else :id="`${uid}-move-${index}`" @click="mapping.cancelCapture()">
              {{ t('settings.rc.moveCancel') }}
            </Button>
            <ProgressBar :value="((mapping.levelOf(row) ?? 0) + 1) / 2" :label="t('settings.rc.level')" />
            <span class="rc-level mono">{{ levelText(row) }}</span>
            <span class="rc-pulse">{{ pulseText(row) }}</span>
            <Button :id="`${uid}-remove-${index}`" @click="mapping.remove(index)">
              {{ t('settings.rc.remove', { channel: row.channel }) }}
            </Button>
          </div>
          <p v-if="mapping.capturing.value === index" class="muted" role="status">{{ t('settings.rc.moveWaiting') }}</p>
          <div class="rc-row-body">
            <Toggle
              :id="`${uid}-invert-${index}`"
              :model-value="row.invert"
              @update:model-value="next => mapping.change(index, { invert: next })"
            >
              {{ t('settings.rc.invert') }}
            </Toggle>
            <label :for="`${uid}-zone-${index}`">{{ t('settings.rc.zone') }}</label>
            <TextInput
              :id="`${uid}-zone-${index}`"
              type="number"
              min="0"
              max="50"
              step="1"
              :model-value="percent(row.deadZone)"
              @change="(event: Event) => mapping.change(index, { deadZone: fractionOf(event, 0.5) })"
            />
            <label :for="`${uid}-expo-${index}`">{{ t('settings.rc.expo') }}</label>
            <TextInput
              :id="`${uid}-expo-${index}`"
              type="number"
              min="0"
              max="100"
              step="1"
              :model-value="percent(row.expo)"
              @change="(event: Event) => mapping.change(index, { expo: fractionOf(event, 1) })"
            />
            <label :for="`${uid}-min-${index}`">{{ t('settings.rc.pulseMin') }}</label>
            <TextInput
              :id="`${uid}-min-${index}`"
              type="number"
              min="800"
              max="2200"
              step="10"
              :placeholder="t('settings.rc.pulseDefault')"
              :model-value="row.pulseMin === undefined ? '' : String(row.pulseMin)"
              @change="(event: Event) => mapping.change(index, ends(row, event, 'pulseMin'))"
            />
            <label :for="`${uid}-max-${index}`">{{ t('settings.rc.pulseMax') }}</label>
            <TextInput
              :id="`${uid}-max-${index}`"
              type="number"
              min="800"
              max="2200"
              step="10"
              :placeholder="t('settings.rc.pulseDefault')"
              :model-value="row.pulseMax === undefined ? '' : String(row.pulseMax)"
              @change="(event: Event) => mapping.change(index, ends(row, event, 'pulseMax'))"
            />
          </div>
        </li>
      </template>
    </ul>
  </div>
</template>

<script setup lang="ts">
// The rows of the mapping: for each, the channel it drives, the pad channel it reads ("Move it" finds it: move the stick, flip
// the switch or press the button), what it reads now, its dead zone, curve and ends, and the pulse it makes now. Every row is
// the same (a pad channel is proportional, a button reads -1 up and 1 pressed). Every change goes through `useRcMapping`, which
// keeps it and takes the confirmation away.
import { computed, nextTick, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import type { RcMapping } from '@/composables/useRcMapping'
import { useFormat } from '@/i18n/useFormat'
import { hasSource } from '@/lib/rc/profile'
import { NOT_MINE, type Row } from '@/lib/rc/types'

const props = defineProps<{
  /** The mapping on the screen. */
  mapping: RcMapping
}>()

const { t } = useI18n()
const { number } = useFormat()
const uid = useId()
const CHANNELS = Array.from({ length: 16 }, (_, index) => index + 1)
const channels = CHANNELS.map(channel => ({ value: String(channel), label: String(channel) }))
const rows = computed(() => props.mapping.draft.value?.rows ?? [])

/**
 * The rows that drive a channel, with their places.
 *
 * @param channel the channel
 * @returns none (the radio's own), one, or more (the mapping says so)
 */
function entriesOn(channel: number): { row: Row, index: number }[] {
  return rows.value.flatMap((row, index) => (row.channel === channel ? [{ row, index }] : []))
}

/**
 * The channel field of a row, as it is on the page now.
 *
 * @param index the row's place
 * @returns the field, or null
 */
function fieldOf(index: number): HTMLSelectElement | null {
  return document.getElementById(`${uid}-channel-${index}`) as HTMLSelectElement | null
}

/** The 16 channels of the vehicle, each with the rows that drive it (none: the radio's own; two: the mapping says so). */
const slots = computed(() => CHANNELS.map(channel => ({ channel, entries: entriesOn(channel) })))

/**
 * The channel field shows the row's channel once the choice has been dealt with: a channel that is refused leaves the row where
 * it was, and the field must not go on showing the refused one (the field is controlled: it is set from the row, not from what
 * was picked, and a refusal does not make it again, so focus stays where it is).
 *
 * @param index the row's place
 * @param event the change event of the field
 */
async function showChannel(index: number, event: Event): Promise<void> {
  const picked = event.target as HTMLSelectElement

  await nextTick()
  // (a row that took another channel is now in that channel's place in the list, so its field is another element: the one that
  // is there now shows its channel, and has the focus the person had)
  const field = fieldOf(index) ?? picked

  field.value = String(rows.value[index]?.channel ?? field.value)
  field.focus()
}

/**
 * Where a row is read from, in words.
 *
 * @param row the row
 * @returns the pad channel
 */
function sourceText(row: Row): string {
  return hasSource(row) ? t('settings.rc.sourceChannel', { n: row.source }) : t('settings.rc.noSource')
}

/**
 * What a row reads now, as a signed number.
 *
 * @param row the row
 * @returns the reading, or a dash when no pad is read or the pad has no such channel
 */
function levelText(row: Row): string {
  const level = props.mapping.levelOf(row)

  return level === null ? t('settings.rc.noPulse') : number(level, 2)
}

/**
 * The pulse a row makes now, in words.
 *
 * @param row the row
 * @returns the pulse, or a dash when no pad is read
 */
function pulseText(row: Row): string {
  const pulse = props.mapping.pulseOf(row)

  // (nothing is the radio's own: a row with no control, or one the pad does not have, makes none)
  return pulse === null || pulse === NOT_MINE ? t('settings.rc.noPulse') : t('settings.rc.pulse', { us: Math.round(pulse) })
}

/**
 * A fraction as the whole percent that is shown.
 *
 * @param fraction the fraction
 * @returns the text
 */
function percent(fraction: number): string {
  return String(Math.round(fraction * 100))
}

/**
 * What a number field says.
 *
 * @param event the change event
 * @returns the number, NaN for an empty or wrong field
 */
function typed(event: Event): number {
  const { value } = event.target as HTMLInputElement

  return value.trim() === '' ? Number.NaN : Number(value)
}

/**
 * A percent that was typed, as the fraction it is, held to the most the row may have.
 *
 * @param event the change event
 * @param most the most the fraction may be
 * @returns the fraction (NaN for a field that is not a number: the change is then not made)
 */
function fractionOf(event: Event, most: number): number {
  const value = typed(event) / 100

  return Number.isFinite(value) ? Math.min(most, Math.max(0, value)) : Number.NaN
}

/**
 * The change an end field makes: the pulse that was typed for one end, whole, with the other end kept (a row has both ends or
 * neither: an empty field takes both away, and the first end typed gives the other the usual 1000 or 2000).
 *
 * @param row the row
 * @param event the change event
 * @param end which end the field is
 * @returns the change
 */
function ends(row: Row, event: Event, end: 'pulseMin' | 'pulseMax'): Partial<Row> {
  const pulse = Math.round(typed(event))

  if (Number.isNaN(pulse)) {
    return { pulseMin: undefined, pulseMax: undefined }
  }

  return { pulseMin: row.pulseMin ?? 1000, pulseMax: row.pulseMax ?? 2000, [end]: pulse }
}
</script>
