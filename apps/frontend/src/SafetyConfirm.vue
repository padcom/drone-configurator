<template>
  <Dialog id="confirm" :title="options.title" @close="answer(false)">
    <p id="vehicle" class="safety-vehicle">{{ options.vehicle || t('safety.noVehicle') }}</p>
    <p id="question" class="safety-what">{{ options.what }}</p>
    <template v-if="options.level === 'typed'">
      <label for="safety-typed">{{ t('safety.typePrompt', { word: options.typedWord }) }}</label>
      <TextInput id="safety-typed" v-model="typed" autocomplete="off" @keydown.enter.prevent />
    </template>
    <p v-else class="safety-hint">{{ t('safety.holdHint', { seconds: HOLD_MS / 1000 }) }}</p>
    <template #actions>
      <Button id="confirm-cancel" data-initial-focus @click="answer(false)">{{ t('confirm.cancel') }}</Button>
      <HoldButton
        v-if="options.level === 'hold'"
        id="confirm-hold"
        :hold-ms="HOLD_MS"
        :arm-ms="IGNORE_MS"
        :danger="options.danger"
        @held="answer(true)"
      >{{ t('confirm.hold') }}</HoldButton>
      <Button
        v-else
        id="confirm-typed"
        :class="{ danger: options.danger }"
        :disabled="!typedMatches(typed, options.typedWord)"
        @click="confirmTyped"
      >{{ t('confirm.confirm') }}</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
// The one way to ask the user before something that changes how the vehicle flies: what will happen, to which vehicle,
// and either a button that must be held (`hold`) or a word that must be typed (`typed`). The safe answer is the default
// focus, Enter in the typed field does nothing, and nothing can confirm in the first moments after it appears.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from './kit/Button.vue'
import Dialog from './kit/Dialog.vue'
import HoldButton from './kit/HoldButton.vue'
import TextInput from './kit/TextInput.vue'
import { HOLD_MS, IGNORE_MS, type SafetyOptions, typedMatches } from './safety'

const props = defineProps<{
  /** What to ask. */
  options: SafetyOptions
}>()

const emit = defineEmits<{
  /** The user's answer: true to go ahead. Sent once. */
  answer: [confirmed: boolean]
}>()

const { t } = useI18n()
const typed = ref('')
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

/** The typed word's button was pressed: it confirms only when the word matches, and not at the very start. */
function confirmTyped(): void {
  if (armed && typedMatches(typed.value, props.options.typedWord)) {
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
