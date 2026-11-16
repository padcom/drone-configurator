<template>
  <div v-if="connected" id="guided-actions" class="guided-actions" role="group" :aria-label="t('guided.actions.title')">
    <CommandButton id="guided-altitude" command="vehicle.changeAltitude" icon-position="none" />
    <CommandButton id="guided-home" command="vehicle.setHomeHere" icon-position="none" />
  </div>
</template>

<script setup lang="ts">
// The two commands of guided control that do not need a place on the map: Change altitude and Set home here, beside the map's
// credit. Each
// says why it may not run (a button that cannot be pressed keeps its reason for a screen reader), and each is also a command
// of the palette.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CommandButton from '@/components/ui/CommandButton.vue'
import { useConfigurator } from '@/composables/useConfigurator'

const { t } = useI18n()
const { fields } = useConfigurator()
const connected = computed(() => fields.connection.value.state === 'connected')
</script>
