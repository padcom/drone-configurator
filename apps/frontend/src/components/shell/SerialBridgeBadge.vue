<template>
  <RouterLink
    v-if="held"
    id="serial-bridge-badge"
    class="serial-bridge-badge"
    :to="{ name: sectionRouteName('setup', 'bridge') }"
    :title="t('topBar.bridge.open')"
  >
    <Icon name="connect" />
    <span>{{ t('topBar.bridge.locked', { port: portName }) }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
// The top bar's reminder that a serial bridge holds a port of the vehicle (#198): it is there on every screen for as long as
// the port is not the vehicle's own, so that a bridge is not forgotten, and it leads to the page that stops it.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Icon from '@/components/ui/Icon.vue'
import { useConfigurator } from '@/composables/useConfigurator'
import { deviceName, holdsPort } from '@/lib/setup/bridge'
import { sectionRouteName } from '@/screens/registry'

const { t } = useI18n()
const bridge = useConfigurator().serialBridge
const held = computed(() => holdsPort(bridge.state.value))
const portName = computed(() => {
  const name = deviceName(bridge.state.value?.device ?? 'GPS1')

  return t(name.key, name.params)
})
</script>
