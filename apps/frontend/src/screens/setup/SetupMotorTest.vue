<template>
  <section id="setup-motor-test" class="motor-test" :aria-labelledby="`${uid}-title`">
    <h4 :id="`${uid}-title`" class="setup-label">{{ t('setup.motors.test.title') }}</h4>
    <Banner id="setup-motor-test-warning" tone="warn">{{ t('setup.motors.test.warning') }}</Banner>
    <p v-if="block !== null" id="setup-motor-test-block" class="muted" role="status">{{ t(`setup.motors.test.${block}`) }}</p>
    <TickUnlock v-model="unlocked" class="motor-test-unlock">
      {{ t('setup.motors.test.tick') }}
    </TickUnlock>
    <div class="setup-esc">
      <label :for="`${uid}-throttle`">{{ t('setup.motors.test.throttle') }}</label>
      <input
        :id="`${uid}-throttle`"
        v-model.number="throttle"
        class="motor-test-throttle"
        type="range"
        :min="MIN_THROTTLE"
        :max="MAX_THROTTLE"
        step="1"
        :disabled="testing"
        @change="saveThrottle"
      >
      <span class="muted">{{ t('setup.motors.test.throttleValue', { percent: throttle, max: MAX_THROTTLE }) }}</span>
    </div>
    <p v-if="buttons === null" id="setup-motor-test-nolayout" class="muted">{{ t('setup.motors.test.noLayout') }}</p>
    <template v-else>
      <p class="muted">{{ t('setup.motors.test.help') }}</p>
      <div class="motor-test-pad" role="group" :aria-label="t('setup.motors.test.pad')">
        <MotorTestButton
          v-for="button in buttons"
          :key="button.number"
          class="motor-test-motor"
          :data-motor="button.letter"
          :style="{ left: `${button.left}%`, top: `${button.top}%` }"
          :disabled="!usable(button.number)"
          :aria-label="t('setup.motors.test.motor', { letter: button.letter })"
          @press="press(button.number)"
          @release="model.release()"
        >
          {{ button.letter }}
        </MotorTestButton>
      </div>
    </template>
    <p id="setup-motor-test-status" class="motor-test-status" role="status" aria-live="polite">{{ status }}</p>
  </section>
</template>

<script setup lang="ts">
// The motor test: one motor spins for as long as its button is HELD, with the propellers off, and stops the moment anything lets
// go of it.
// The buttons are the frame (labelled by the test order, A first, and put where the motor is: never by the number of an output),
// locked until "The propellers are off" is ticked (presses in the first moments after the tick are ignored), and they are for a
// vehicle that is KNOWN to be disarmed (the backend refuses the rest). The unlock goes away when the vehicle is gone, armed or
// not known, and when a test ended any way but the button being let go. Nothing starts a test but a pressed button: no shortcut,
// no palette command.
import { computed, onBeforeUnmount, onDeactivated, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MotorTestButton from '@/components/setup/MotorTestButton.vue'
import Banner from '@/components/ui/Banner.vue'
import TickUnlock from '@/components/ui/TickUnlock.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import {
  IGNORE_AFTER_UNLOCK_MS,
  MAX_THROTTLE,
  MIN_THROTTLE,
  clampThrottle,
  endedNormally,
  letterOf,
  testButtons,
} from '@/lib/setup/motorTest'

/** Where the throttle that was chosen is kept (a value outside 1 to 20 is clamped when it is read). */
const THROTTLE_KEY = 'motorTest.throttle'

const { t, te } = useI18n()
const uid = useId()
const handle = useConfigurator()
const model = handle.motorTest
const unlocked = ref(false)
/** Whether the buttons take a press: the tick was made at least IGNORE_AFTER_UNLOCK_MS ago. */
const ready = ref(false)
const throttle = ref(clampThrottle(handle.settings.uiValue(THROTTLE_KEY)))
const block = computed(() => model.block.value)
const testing = computed(() => model.motor.value !== null)
let readyTimer: ReturnType<typeof setTimeout> | undefined

/**
 * A parameter of the vehicle as it holds it now (the frame is the vehicle's, not a draft: the test order is the vehicle's).
 *
 * @param id the parameter
 * @returns its value, or -1 when the vehicle has none (which no layout has)
 */
function valueOf(id: string): number {
  return handle.parameters.params.value.find(param => param.id === id)?.value ?? -1
}

/**
 * The words for how the test is.
 *
 * @param motor the motor that runs, or null
 * @param ended how the last test ended, or null
 * @returns the line
 */
function statusOf(motor: number | null, ended: { motor: number, why: string } | null): string {
  if (motor !== null) {
    return t('setup.motors.test.running', { letter: letterOf(motor) })
  }
  if (ended === null) {
    return ''
  }
  const key = `setup.motors.test.stopped.${ended.why}`

  return t(te(key) ? key : 'setup.motors.test.stopped.OTHER', { letter: letterOf(ended.motor), why: ended.why })
}

const buttons = computed(() => testButtons(valueOf('FRAME_CLASS'), valueOf('FRAME_TYPE')))
const status = computed(() => statusOf(model.motor.value, model.ended.value))
/** Whether the buttons are unlocked, the tick is not new, and the vehicle is known to be disarmed. */
const open = computed(() => unlocked.value && ready.value && block.value === null)
/** Whether no motor is held, and the vehicle has settled after the last test. */
const free = computed(() => model.motor.value === null && !model.settling.value)

/**
 * Whether a button takes a press: the buttons are open, and no OTHER motor is held.
 *
 * @param number the motor's number in the test order
 * @returns true if it does
 */
function usable(number: number): boolean {
  return open.value && (free.value || model.motor.value === number)
}

/**
 * A button went down: the motor is tested at the throttle (held to the cap here, and by the backend again).
 *
 * @param number the motor's number in the test order
 */
function press(number: number): void {
  model.start(number, clampThrottle(throttle.value))
}

/** The slider was let go: the throttle is kept for next time. */
function saveThrottle(): void {
  throttle.value = clampThrottle(throttle.value)
  void handle.settings.setUi(THROTTLE_KEY, String(throttle.value), true)
}

// Ticking the box unlocks the buttons after a moment; unticking it locks them at once, and lets go of a motor that is held.
watch(unlocked, on => {
  clearTimeout(readyTimer)
  ready.value = false

  if (on) {
    readyTimer = setTimeout(() => {
      ready.value = true
    }, IGNORE_AFTER_UNLOCK_MS)
  } else {
    model.release()
  }
})

// A vehicle that is gone, armed or not known takes the unlock away.
watch(block, next => next !== null && (unlocked.value = false))

// A test that ended any way but the button being let go (the page fell silent, the link was lost, the vehicle refused) takes it
// away too.
watch(() => model.ended.value, ended => ended !== null && !endedNormally(ended.why) && (unlocked.value = false))

/** The window lost the focus, or was hidden: a motor that is held is let go. */
function leave(): void {
  model.release()
}

onMounted(() => {
  window.addEventListener('blur', leave)
  document.addEventListener('visibilitychange', leave)
})

// The shell and Setup keep the pages they leave alive (KeepAlive): a page that is left is DEACTIVATED, not unmounted, so that is
// where a page change lets go of the motor, and takes the unlock away (it is ticked again when the page is back).
onDeactivated(() => {
  unlocked.value = false
  model.release()
})

// The page going away (the window closing) lets go of the motor, and the backend stops it.
onBeforeUnmount(() => {
  window.removeEventListener('blur', leave)
  document.removeEventListener('visibilitychange', leave)
  clearTimeout(readyTimer)
  model.release()
})
</script>
