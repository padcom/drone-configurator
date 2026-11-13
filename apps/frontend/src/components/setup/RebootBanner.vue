<template>
  <Banner v-if="show" id="setup-reboot" tone="warn">
    <span>{{ t('setup.reboot.needed') }}</span>
    <CommandButton command="vehicle.reboot" icon-position="none" />
  </Banner>
</template>

<script setup lang="ts">
// "Reboot needed": what a page wrote only takes effect when the flight controller restarts. It offers the reboot command
// (which is held, and refused while the vehicle is armed or not known to be disarmed), and never reboots by itself.
import { useI18n } from 'vue-i18n'
import Banner from '@/components/ui/Banner.vue'
import CommandButton from '@/components/ui/CommandButton.vue'

defineProps<{
  /** Whether something that needs a reboot was written. */
  show: boolean
}>()

const { t } = useI18n()
</script>
