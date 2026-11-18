<template>
  <button
    v-if="rc.active.value"
    id="rc-indicator"
    type="button"
    class="rc-indicator"
    :class="{ waiting: !rc.gateOpen.value }"
    :title="label"
    :aria-label="label"
    @click="turnOff"
  >
    <span class="dot" aria-hidden="true" />
    <span>{{ t('rc.indicator.on') }}</span>
    <span v-if="rc.rudderLifted.value" id="rc-indicator-rudder" class="rc-indicator-flag">{{ t('rc.indicator.rudder') }}</span>
  </button>
</template>

<script setup lang="ts">
// The always-visible mark that the RC control is on: a button in the top bar, on every screen, that turns it off in one click
// and asks nothing (stopping must be as easy as anything can be). It says nothing when the control is off. Its name for a screen
// reader begins with what it shows ("RC control on") and then says what pressing it does. The button goes when it is pressed, so
// the focus goes to the screen's own region (never left on nothing).
import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '@/composables/useConfigurator'

const { t } = useI18n()
const { rcControl: rc } = useConfigurator()
/** What the button is called (and titled): that the control is on, with the sticks' arm and disarm when it is lifted. */
const label = computed(() => t(rc.rudderLifted.value ? 'rc.indicator.offRudder' : 'rc.indicator.off'))

/** Turns the control off, and puts the focus where it can go on from. */
async function turnOff(): Promise<void> {
  rc.disable()
  await nextTick()
  document.querySelector<HTMLElement>('.app-main')?.focus()
}
</script>
