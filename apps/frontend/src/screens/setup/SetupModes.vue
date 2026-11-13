<template>
  <section class="setup-page-body" :aria-label="t('setup.section.modes')">
    <div class="setup-main">
      <p class="muted">{{ t('setup.modes.summary') }}</p>
      <EmptyState v-if="!modes" :title="t('setup.modes.loading')" :help="error ?? ''" :level="4" />
      <template v-else>
        <div class="setup-channel">
          <label :for="`${uid}-channel`">{{ t('setup.modes.channel') }}</label>
          <Select
            :id="`${uid}-channel`"
            :model-value="String(panel.value('FLTMODE_CH') ?? 0)"
            :options="channelOptions"
            :disabled="panel.blocked.value !== null"
            @update:model-value="setChannel"
          />
          <p class="muted">{{ t('setup.modes.noLive') }}</p>
        </div>
        <ol class="setup-slots">
          <li v-for="(param, i) in SLOT_PARAMS" :key="param" class="setup-slot">
            <span class="setup-slot-no">{{ i + 1 }}</span>
            <span class="setup-slot-range">{{ rangeText(i) }}</span>
            <EnumField
              :model-value="panel.value(param) ?? 0"
              :options="options"
              :label="t('setup.modes.slot', { n: i + 1 })"
              :disabled="panel.blocked.value !== null || panel.missing.value.includes(param)"
              @update:model-value="panel.set(param, $event)"
            />
            <span class="muted setup-slot-hint">{{ hint(panel.value(param)) }}</span>
          </li>
        </ol>
        <Banner v-if="escapeMissing" id="setup-no-escape" tone="warn">{{ t('setup.modes.noEscape') }}</Banner>
      </template>
    </div>
    <PanelAside :panel="panel" id-prefix="setup-modes">
      <div>
        <h2 class="setup-label">{{ t('setup.modes.goodTitle') }}</h2>
        <ul>
          <li>{{ t('setup.modes.good1') }}</li>
          <li>{{ t('setup.modes.good2') }}</li>
          <li>{{ t('setup.modes.good3') }}</li>
        </ul>
      </div>
    </PanelAside>
  </section>
</template>

<script setup lang="ts">
// Flight modes: the six slots of the mode switch, each with a mode of the connected vehicle's kind (named by the vehicle's
// dialect through `vehicle.modes`; a number with no name is shown as the number, never as a name), and the channel of the
// switch. Nothing is written until "Write and verify" (one question, each read back), and not while the vehicle is armed or may
// be. The live position of the switch is not shown: live radio channels (the `rc` group) come with the Radio page, and this
// page will light the slot the switch is in then.
import { computed, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelAside from '@/components/setup/PanelAside.vue'
import Banner from '@/components/ui/Banner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Select from '@/components/ui/Select.vue'
import EnumField from '@/components/fields/EnumField.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { CHANNELS, MODE_PARAMS, SLOT_PARAMS, hasHint, noEscape, parseChannel, slotRange } from '@/lib/setup/flightModes'

/**
 * A mode's name as the dialect gives it, readable: `ALT_HOLD` is shown as `ALT HOLD` (nothing is made up).
 *
 * @param name the dialect's name
 * @returns the name
 */
function nameOf(name: string): string {
  return name.replaceAll('_', ' ')
}

const { t } = useI18n()
const uid = useId()
const handle = useConfigurator()
const panel = useParamPanel(MODE_PARAMS, handle)
const modes = computed(() => handle.setup.modes.value)
const error = computed(() => handle.setup.error.value)
const options = computed(() => (modes.value?.modes ?? []).map(mode => ({ value: mode.number, label: nameOf(mode.name) })))
/** The channels the switch can be on (0 is none), and the vehicle's own value when it is none of them (shown, not hidden). */
const channelOptions = computed(() => {
  const now = panel.value('FLTMODE_CH')
  const named = CHANNELS.map(n => ({
    value: String(n),
    label: n === 0 ? t('setup.modes.channelNone') : t('setup.modes.channelN', { n }),
  }))

  return now === null || CHANNELS.includes(now) ? named : [...named, { value: String(now), label: String(now) }]
})
const escapeMissing = computed(() => noEscape(SLOT_PARAMS.map(param => panel.value(param) ?? -1)))

onMounted(() => {
  void handle.setup.loadModes()
})

/**
 * The pulse widths a slot answers to.
 *
 * @param slot the slot, 0 to 5
 * @returns the words
 */
function rangeText(slot: number): string {
  const range = slotRange(slot)
  if (range.kind === 'between') {
    return `${range.from}–${range.to}`
  }

  return range.kind === 'upTo' ? t('setup.modes.upTo', { to: range.to }) : t('setup.modes.from', { from: range.from })
}

/**
 * The line of help under a slot.
 *
 * @param mode the mode's number
 * @returns the words, or nothing for a mode that has none
 */
function hint(mode: number | null): string {
  return mode !== null && hasHint(mode) ? t(`setup.modes.hint.${mode}`) : ''
}

/**
 * The channel chosen: a whole number from 0 to 16 (0 is none), else it is not taken.
 *
 * @param text the option's value
 */
function setChannel(text: string): void {
  const channel = parseChannel(text)
  if (channel !== null) {
    panel.set('FLTMODE_CH', channel)
  }
}
</script>
