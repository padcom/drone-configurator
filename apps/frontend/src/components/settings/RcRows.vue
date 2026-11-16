<template>
  <div class="rc-rows">
    <p v-if="mapping.refusal.value?.code === 'arm'" id="rc-refusal" class="rc-warn" role="status">
      {{ t('settings.rc.refusedArm', { channel: mapping.refusal.value.channel }) }}
    </p>
    <ul class="rc-list">
      <li v-for="(row, index) in rows" :key="index" class="rc-row" :data-testid="`rc-row-${index}`">
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
          <Button v-else :id="`${uid}-move-${index}`" @click="mapping.cancelCapture()">{{ t('settings.rc.moveCancel') }}</Button>
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
    </ul>
    <div class="rc-add">
      <Button v-for="kind in KINDS" :id="`${uid}-add-${kind}`" :key="kind" :disabled="locked" @click="mapping.add(kind)">
        {{ t(`settings.rc.add.${kind}`) }}
      </Button>
    </div>
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
import type { Row } from '@/lib/rc/types'

const props = defineProps<{
  /** The mapping on the screen. */
  mapping: RcMapping
}>()

const { t } = useI18n()
const uid = useId()
const KINDS: NewRow[] = ['stick', 'switch', 'button']
const POSITIONS = ['low', 'mid', 'high']
const channels = Array.from({ length: 16 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }))
const rows = computed(() => props.mapping.draft.value?.rows ?? [])
const locked = computed(() => props.mapping.wizard.value !== null)

/**
 * The channel field shows the row's channel once the choice has been dealt with: a channel that is refused leaves the row where
 * it was, and the field must not go on showing the refused one (the field is controlled: it is made again from the row, not
 * from what was picked, and it is not itself made again, so focus stays where it is).
 *
 * @param index the row's place
 * @param event the change event of the field
 */
async function showChannel(index: number, event: Event): Promise<void> {
  const field = event.target as HTMLSelectElement

  await nextTick()
  field.value = String(props.mapping.draft.value?.rows[index]?.channel ?? field.value)
}

/**
 * Where a row is read from, in words.
 *
 * @param row the row
 * @returns the axis or the button
 */
function sourceText(row: Row): string {
  return row.kind === 'button' ? t('settings.rc.sourceButton', { n: row.button }) : t('settings.rc.sourceAxis', { n: row.axis })
}

/**
 * The pulse a row makes now, in words.
 *
 * @param row the row
 * @returns the pulse, or a dash when no pad is read
 */
function pulseText(row: Row): string {
  const pulse = props.mapping.pulseOf(row)

  return pulse === null ? t('settings.rc.noPulse') : t('settings.rc.pulse', { us: Math.round(pulse) })
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
