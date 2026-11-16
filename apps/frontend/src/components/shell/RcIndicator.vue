<template>
  <button
    v-if="rc.active.value"
    id="rc-indicator"
    type="button"
    class="rc-indicator"
    :class="{ waiting: !rc.gateOpen.value }"
    :title="t('rc.indicator.off')"
    :aria-label="t('rc.indicator.off')"
    @click="rc.disable()"
  >
    <span class="dot" aria-hidden="true" />
    <span>{{ t('rc.indicator.on') }}</span>
  </button>
</template>

<script setup lang="ts">
// The always-visible mark that the RC control is on: a button in the top bar, on every screen, that turns it off in one click
// and asks nothing (stopping must be as easy as anything can be). It says nothing when the control is off.
import { useI18n } from 'vue-i18n'
import { useConfigurator } from '@/composables/useConfigurator'

const { t } = useI18n()
const { rcControl: rc } = useConfigurator()
</script>
