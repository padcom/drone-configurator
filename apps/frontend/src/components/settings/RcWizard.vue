<template>
  <div class="rc-wizard">
    <Button v-if="view === null" id="rc-calibrate" :disabled="!live" @click="mapping.startWizard()">
      {{ t('settings.rc.wizard.start') }}
    </Button>
    <div v-else class="rc-wizard-steps" role="group" :aria-labelledby="`${uid}-step`">
      <p :id="`${uid}-step`" class="rc-step" role="status">
        {{ t(`settings.rc.wizard.${stepKey}`) }}
      </p>
      <ul v-if="view.step === 'move'" class="rc-travel">
        <li v-for="one in view.axes" :key="one.axis">
          <span>{{ t('settings.rc.wizard.axis', { n: one.axis }) }}</span>
          <ProgressBar
            :value="one.travel / 2"
            :label="t('settings.rc.wizard.axis', { n: one.axis })"
            :tone="view.failed.includes(one.axis) ? 'warn' : 'accent'"
          />
        </li>
      </ul>
      <p v-if="view.failed.length > 0" id="rc-wizard-failed" class="rc-warn" role="alert">
        {{ t('settings.rc.wizard.failed', { axes: view.failed.join(', ') }) }}
      </p>
      <div class="rc-wizard-actions">
        <Button v-if="view.step === 'rest'" id="rc-next" variant="primary" :disabled="!view.ready" @click="mapping.nextStep()">
          {{ t('settings.rc.wizard.next') }}
        </Button>
        <Button v-else id="rc-finish" variant="primary" @click="mapping.finishWizard()">
          {{ t('settings.rc.wizard.finish') }}
        </Button>
        <Button id="rc-wizard-cancel" @click="mapping.cancelWizard()">{{ t('settings.rc.wizard.cancel') }}</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// The calibration wizard: first the sticks at rest (the throttle where it rests), then every stick moved to all of its ends.
// It is the only thing that gives a mapping its mark of having been calibrated, and a mapping without it drives nothing. The
// first step goes on by itself counting; the person goes on when it says so, and finishes when every stick has travelled.
import { computed, useId } from 'vue'
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
const view = computed(() => props.mapping.wizard.value)
/** The words of the step: the first (waiting for the reads, or done), or the second. */
const stepKey = computed(() => {
  const now = view.value

  if (now === null || now.step === 'move') {
    return 'move'
  }

  return now.ready ? 'restReady' : 'rest'
})
</script>
