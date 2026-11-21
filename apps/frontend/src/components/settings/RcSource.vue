<template>
  <div class="rc-source">
    <fieldset class="rc-style">
      <legend class="rc-heading">{{ t('settings.rc.source.title') }}</legend>
      <label v-for="choice in CHOICES" :key="choice" :for="`${uid}-source-${choice}`">
        <input
          :id="`${uid}-source-${choice}`"
          type="radio"
          :name="`${uid}-source`"
          :value="choice"
          :checked="settings.padSource.value === choice"
          :aria-describedby="`${uid}-source-help`"
          @change="settings.setPadSource(choice)"
        >
        {{ t(`settings.rc.source.${choice}`) }}
      </label>
      <p :id="`${uid}-source-help`" class="muted">{{ t('settings.rc.source.help') }}</p>
    </fieldset>
    <p v-if="unsupported" id="rc-source-unsupported" class="muted" role="status">{{ t('settings.rc.source.unsupported') }}</p>
    <template v-if="pads.source.value === 'backend'">
      <p v-if="pads.unavailable.value !== null" id="rc-source-unavailable" class="rc-warn" role="status">
        {{ t('settings.rc.source.unavailable', { code: pads.unavailable.value }) }}
      </p>
      <p v-else-if="pads.list.value === null" id="rc-source-asking" class="muted" role="status">
        {{ t('settings.rc.source.asking') }}
      </p>
      <!-- (what the backend answered, when that adds something: with no pad and none denied "sees no gamepad" says it) -->
      <p v-else-if="answered" id="rc-source-answer" class="muted">
        {{ t('settings.rc.source.answer', { pads: listed, denied: refused }) }}
      </p>
      <div v-if="pads.list.value !== null && pads.list.value.pads.length > 1" class="settings-row">
        <label :for="`${uid}-pad`">{{ t('settings.rc.source.pad') }}</label>
        <Select :id="`${uid}-pad`" v-model="chosen" :options="options" />
      </div>
      <p
        v-for="denied in pads.list.value?.denied ?? []"
        :key="denied.id"
        class="rc-warn"
        role="status"
        data-testid="rc-denied"
      >
        {{ t('settings.rc.source.denied', { name: denied.name }) }}
      </p>
      <p v-if="failure !== null" id="rc-source-ended" class="rc-warn" role="status">
        {{ t('settings.rc.source.ended', { code: failure }) }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
// Where the gamepad is read from (the browser's Gamepad API, the backend's `pad.*`, or automatic), and which pad when the backend
// has several. The browser is the default until the leader has confirmed the backend's pad on hardware. A pad the backend may
// not open (the desktop's access rule) is said with what to do, and the browser stays a choice.
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/ui/Select.vue'
import type { PadsModel } from '@/composables/usePads'
import type { RcSettings } from '@/composables/useRcSettings'
import type { PadSourceChoice } from '@/lib/rc/padsource'

const props = defineProps<{
  /** The pads the backend reads. */
  pads: PadsModel
  /** The settings of the RC control. */
  settings: RcSettings
}>()

const { t } = useI18n()
const uid = useId()
const CHOICES: PadSourceChoice[] = ['auto', 'backend', 'browser']

/** Whether the person asked for the backend and it cannot read pads on this computer (the list says so). */
const unsupported = computed(() => props.settings.padSource.value !== 'browser' && props.pads.list.value?.supported === false)
/** How many pads the backend listed, and how many it may not open. */
const listed = computed(() => props.pads.list.value?.pads.length ?? 0)
const refused = computed(() => props.pads.list.value?.denied.length ?? 0)
/** Whether the backend answered with something to say: a pad listed, or a pad it may not open. */
const answered = computed(() => listed.value + refused.value > 0)
/** Why the read of the pad ended by itself, unless it was only unplugged (the list says so). */
const failure = computed(() => (props.pads.ended.value === 'DISCONNECTED' ? null : props.pads.ended.value))
/** The pads of the list, by name. */
const options = computed(() => (props.pads.list.value?.pads ?? []).map(pad => ({ value: pad.id, label: pad.name })))
/** The pad that is read, and the choice of another. */
const chosen = computed({
  get: () => props.pads.selected.value?.id ?? '',
  set: (id: string) => void props.settings.setPadDevice(id),
})
</script>
