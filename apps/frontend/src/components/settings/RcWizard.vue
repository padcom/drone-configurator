<template>
  <div class="rc-wizard" role="group" :aria-label="t('settings.rc.wizard.title')">
    <template v-if="view !== null">
      <p :id="`${uid}-step`" class="rc-step" role="status">{{ t(`settings.rc.wizard.${stepKey}`) }}</p>
      <ul v-if="view.step === 'move'" class="rc-travel">
        <li v-for="one in view.axes" :key="one.axis">
          <span>{{ t('settings.rc.wizard.axis', { n: one.axis + 1 }) }}</span>
          <ProgressBar
            :value="one.travel / 2"
            :label="t('settings.rc.wizard.axis', { n: one.axis + 1 })"
            :tone="view.failed.includes(one.axis) ? 'warn' : 'accent'"
          />
        </li>
      </ul>
      <p v-if="view.failed.length > 0" id="rc-wizard-failed" class="rc-warn" role="alert">
        {{ t('settings.rc.wizard.failed', { axes: view.failed.map(axis => `CH${axis + 1}`).join(', ') }) }}
      </p>
    </template>
    <div class="rc-wizard-actions">
      <!-- One button for the three steps (Calibrate, Next, Finish): it is never made again, so focus stays on it. -->
      <Button
        id="rc-wizard-main"
        ref="main"
        :variant="view === null ? 'default' : 'primary'"
        :disabled="disabled"
        :aria-describedby="why"
        @click="advance"
      >
        {{ t(`settings.rc.wizard.${label}`) }}
      </Button>
      <Button v-if="view !== null" id="rc-wizard-cancel" @click="cancel">{{ t('settings.rc.wizard.cancel') }}</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
// The calibration wizard: first the sticks at rest (the throttle where it rests), then every stick moved to all of its ends.
// It is the only thing that gives a mapping its mark of having been calibrated, and a mapping without it drives nothing. The
// first step goes on by itself counting; the person goes on when it says so, and finishes when every stick has travelled.
// One button (Calibrate, Next, Finish) stays where it is through the steps, so that focus is not lost when the step changes;
// when the wizard is given up, focus goes back to it.
import { computed, nextTick, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/ui/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import type { RcMapping } from '@/composables/useRcMapping'

const props = defineProps<{
  /** The mapping on the screen. */
  mapping: RcMapping
  /** Whether a pad is being read. */
  live: boolean
}>()

const { t } = useI18n()
const uid = useId()
const main = useTemplateRef<InstanceType<typeof Button>>('main')
const view = computed(() => props.mapping.wizard.value)
/** The words of the step: the first (waiting for the reads, or done), or the second. */
const stepKey = computed(() => {
  const now = view.value

  if (now === null || now.step === 'move') {
    return 'move'
  }

  return now.ready ? 'restReady' : 'rest'
})
/** The words of the button: it begins the wizard, goes to the second step, or finishes. */
const label = computed(() => {
  if (view.value === null) {
    return 'start'
  }

  return view.value.step === 'rest' ? 'next' : 'finish'
})
/** Whether the button cannot be used: no pad to calibrate, or the first step has not got its reads yet. */
const disabled = computed(() => (view.value === null ? !props.live : view.value.step === 'rest' && !view.value.ready))
/** What says why it cannot: the line about the pad that is not read, or the words of the step that is not done. */
const why = computed(() => {
  if (!disabled.value) {
    return undefined
  }

  return view.value === null ? 'rc-device-gone' : `${uid}-step`
})

/** The button is pressed: the wizard begins, goes on, or finishes (as far as it can). */
function advance(): void {
  const now = view.value

  if (now === null) {
    props.mapping.startWizard()
  } else if (now.step === 'rest') {
    props.mapping.nextStep()
  } else {
    props.mapping.finishWizard()
  }
}

/** The wizard is given up: focus goes back to the button that began it (the button this one replaced is not there to ask). */
async function cancel(): Promise<void> {
  props.mapping.cancelWizard()
  await nextTick()
  main.value?.$el.focus()
}
</script>
