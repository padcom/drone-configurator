<template>
  <Dialog id="confirm" :title="options.title" @close="answer(false)">
    <p id="vehicle" class="safety-vehicle">{{ options.vehicle || t('safety.noVehicle') }}</p>
    <p id="question" class="safety-what">{{ options.what }}</p>
    <p v-if="options.level === 'hold'" id="safety-hint" class="safety-hint">
      {{ t('safety.holdHint', { seconds: HOLD_MS / 1000 }) }}
    </p>
    <p role="status" class="safety-tapped"><template v-if="tapped">{{ t('safety.tapped') }}</template></p>
    <template #actions>
      <Button id="confirm-cancel" data-initial-focus @click="cancel">{{ t('confirm.cancel') }}</Button>
      <HoldButton
        v-if="options.level === 'hold'"
        id="confirm-hold"
        aria-describedby="safety-hint"
        :hold-ms="HOLD_MS"
        :arm-ms="IGNORE_MS"
        :tone="options.tone"
        @held="answer(true)"
        @tap="tapped = true"
      >{{ options.confirmLabel }}</HoldButton>
      <Button v-else id="confirm-yes" variant="primary" @click="confirm">{{ options.confirmLabel }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// The one way to ask the user before something that changes the vehicle: what will happen, to which vehicle, and either a
// button that must be held (`hold`: arming, an emergency stop) or a plain one (`plain`: a parameter write, which the
// vehicle's read-back makes safe). The safe answer is the default focus, and nothing can confirm (or cancel, in case a key
// from the button that opened it is still held) in the first moments after it appears. There is no typed word, ever.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import Dialog from './kit/Dialog.vue'
import HoldButton from './kit/HoldButton.vue'
import { HOLD_MS, IGNORE_MS, type SafetyOptions } from './safety'

defineProps<{
  /** What to ask. */
  options: SafetyOptions
}>()

const emit = defineEmits<{
  /** The user's answer: true to go ahead. Sent once. */
  answer: [confirmed: boolean]
}>()

const { t } = useI18n()
const tapped = ref(false)
let armed = false
let answered = false
let armTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Passes the answer on, the first time only (a second click, key or timer is too late).
 *
 * @param confirmed whether to go ahead
 */
function answer(confirmed: boolean): void {
  if (!answered) {
    answered = true
    emit('answer', confirmed)
  }
}

/**
 * Cancel was pressed. Not in the first moments: a Space that opened the dialog and is still held comes up on Cancel
 * and would click it (Escape and the other ways to leave work at once).
 */
function cancel(): void {
  if (armed) {
    answer(false)
  }
}

/** The plain confirm button was pressed: it goes ahead, but not at the very start (a click meant for what was under). */
function confirm(): void {
  if (armed) {
    answer(true)
  }
}

onMounted(() => {
  armTimer = setTimeout(() => {
    armed = true
  }, IGNORE_MS)
})

onBeforeUnmount(() => clearTimeout(armTimer))
</script>
