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
            <Button
              v-for="kind in KINDS"
              :id="`${uid}-add-${kind}-${slot.channel}`"
              :key="kind"
              :disabled="locked"
              @click="mapping.add(kind, slot.channel)"
            >
              {{ t(`settings.rc.add.${kind}`) }}
            </Button>
          </div>
        </li>
        <li v-for="{ row, index } in slot.entries" :key="index" class="rc-row" :data-testid="`rc-row-${index}`">
          <div class="rc-row-head">
            <span class="rc-kind">{{ t(`settings.rc.kind.${row.kind}`) }}</span>
            <label :for="`${uid}-channel-${index}`">{{ t('settings.rc.channel') }}</label>
            <Select
              :id="`${uid}-channel-${index}`"
              :model-value="String(row.channel)"
              :options="channels"
              :disabled="locked"
              @update:model-value="(next: string) => mapping.setChannel(index, Number(next))"
              @change="(event: Event) => showChannel(index, event)"
            />
            <span class="rc-source">{{ sourceText(row) }}</span>
            <Button
              v-if="mapping.capturing.value !== index"
              :id="`${uid}-move-${index}`"
              :disabled="locked"
              @click="mapping.capture(index)"
            >
              {{ t('settings.rc.moveIt') }}
            </Button>
            <Button v-else :id="`${uid}-move-${index}`" @click="mapping.cancelCapture()">
              {{ t('settings.rc.moveCancel') }}
            </Button>
            <span class="rc-pulse">{{ pulseText(row) }}</span>
            <Button :id="`${uid}-remove-${index}`" :disabled="locked" @click="mapping.remove(index)">
              {{ t('settings.rc.remove', { channel: row.channel }) }}
            </Button>
          </div>
          <p v-if="mapping.capturing.value === index" class="muted" role="status">{{ t('settings.rc.moveWaiting') }}</p>
          <div class="rc-row-body">
            <template v-if="row.kind !== 'button'">
              <Toggle
                :id="`${uid}-invert-${index}`"
                :model-value="row.invert"
                :disabled="locked"
                @update:model-value="next => mapping.change(index, { invert: next })"
              >
                {{ t('settings.rc.invert') }}
              </Toggle>
            </template>
            <template v-if="row.kind === 'stick'">
              <label :for="`${uid}-zone-${index}`">{{ t('settings.rc.zone') }}</label>
              <TextInput
                :id="`${uid}-zone-${index}`"
                type="number"
                min="0"
                max="50"
                step="1"
                :disabled="locked"
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
                :disabled="locked"
                :model-value="percent(row.expo)"
                @change="(event: Event) => mapping.change(index, { expo: fractionOf(event, 1) })"
              />
            </template>
            <template v-if="row.kind === 'switch'">
              <template v-for="(pulse, place) in row.pulses" :key="place">
                <label :for="`${uid}-pulse-${index}-${place}`">{{ t(`settings.rc.position.${POSITIONS[place]}`) }}</label>
                <TextInput
                  :id="`${uid}-pulse-${index}-${place}`"
                  type="number"
                  min="800"
                  max="2200"
                  step="10"
                  :disabled="locked"
                  :model-value="String(pulse)"
                  @change="(event: Event) => mapping.change(index, { pulses: pulsesWith(row.pulses, place, event) })"
                />
              </template>
            </template>
            <template v-if="row.kind === 'button'">
              <label :for="`${uid}-off-${index}`">{{ t('settings.rc.up') }}</label>
              <TextInput
                :id="`${uid}-off-${index}`"
                type="number"
                min="800"
                max="2200"
                step="10"
                :disabled="locked"
                :model-value="String(row.off)"
                @change="(event: Event) => mapping.change(index, { off: whole(event) })"
              />
              <label :for="`${uid}-on-${index}`">{{ t('settings.rc.pressed') }}</label>
              <TextInput
                :id="`${uid}-on-${index}`"
                type="number"
                min="800"
                max="2200"
                step="10"
                :disabled="locked"
                :model-value="String(row.on)"
                @change="(event: Event) => mapping.change(index, { on: whole(event) })"
              />
            </template>
          </div>
        </li>
      </template>
    </ul>
  </div>
</template>

<script setup lang="ts">
// The rows of the mapping: for each, the channel it drives, the control it is read from ("Move it" finds it: move the stick or
// press the button), its curve or pulses, and the pulse it makes now. Every change goes through `useRcMapping`, which keeps it
// and takes the wizard's mark away. While the wizard runs the rows are locked.
import { computed, nextTick, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import Toggle from '@/components/ui/Toggle.vue'
import type { NewRow, RcMapping } from '@/composables/useRcMapping'
import { hasSource } from '@/lib/rc/profile'
import { NOT_MINE, type Row } from '@/lib/rc/types'

const props = defineProps<{
  /** The mapping on the screen. */
  mapping: RcMapping
}>()

const { t } = useI18n()
const uid = useId()
const KINDS: NewRow[] = ['stick', 'switch', 'button']
const POSITIONS = ['low', 'mid', 'high']
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
const locked = computed(() => props.mapping.wizard.value !== null)

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
 * @returns the axis or the button
 */
function sourceText(row: Row): string {
  if (!hasSource(row)) {
    return t('settings.rc.noSource')
  }

  if (row.kind === 'button') {
    return t('settings.rc.sourceButton', { n: row.button })
  }

  return t('settings.rc.sourceAxis', { n: row.axis + 1 })
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
 * A pulse that was typed, whole.
 *
 * @param event the change event
 * @returns the pulse, NaN for a field that is not a number
 */
function whole(event: Event): number {
  return Math.round(typed(event))
}

/**
 * The three pulses of a switch with one replaced.
 *
 * @param pulses the pulses
 * @param place which one
 * @param event the change event
 * @returns the new pulses
 */
function pulsesWith(pulses: readonly [number, number, number], place: number, event: Event): [number, number, number] {
  const next: [number, number, number] = [...pulses]

  next[place] = whole(event)

  return next
}
</script>
