<template>
  <section class="setup-page-body" :aria-labelledby="`${uid}-title`">
    <div class="setup-main">
      <h3 :id="`${uid}-title`" class="visually-hidden">{{ t('setup.section.modes') }}</h3>
      <p class="muted">{{ t('setup.modes.summary') }}</p>
      <EmptyState v-if="!modes" :title="t('setup.modes.loading')" :help="error ?? ''" :level="4" />
      <template v-else>
        <div class="setup-channel">
          <label :for="`${uid}-channel`">{{ t('setup.modes.channel') }}</label>
          <PanelField
            :panel="panel"
            id="FLTMODE_CH"
            kind="enum"
            :input-id="`${uid}-channel`"
            :options="channelOptions"
            :label="t('setup.modes.channel')"
            closed
          />
          <p class="muted">{{ t('setup.modes.noLive') }}</p>
        </div>
        <ol class="setup-slots">
          <li v-for="(param, i) in SLOT_PARAMS" :key="param" class="setup-slot">
            <span class="setup-slot-no">{{ i + 1 }}</span>
            <span class="setup-slot-range">{{ rangeText(i) }}</span>
            <PanelField
              :panel="panel"
              :id="param"
              kind="enum"
              :options="options"
              :label="t('setup.modes.slot', { n: i + 1 })"
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
// page will light the slot the switch is in then. Each slot is a field bound to its parameter (PanelField): it says in words
// whether it is the vehicle's mode, a choice made here, written and read back, or rejected. The channel stays a closed list
// (0 to 16 only), which a field that takes any number could not keep.
import { computed, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import PanelAside from '@/components/setup/PanelAside.vue'
import Banner from '@/components/ui/Banner.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PanelField from '@/components/fields/PanelField.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { useParamPanel } from '@/composables/useParamPanel'
import { CHANNELS, MODE_PARAMS, SLOT_PARAMS, hasHint, noEscape, slotRange } from '@/lib/setup/flightModes'

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
    value: n,
    label: n === 0 ? t('setup.modes.channelNone') : t('setup.modes.channelN', { n }),
  }))

  return now === null || CHANNELS.includes(now) ? named : [...named, { value: now, label: String(now) }]
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

</script>
