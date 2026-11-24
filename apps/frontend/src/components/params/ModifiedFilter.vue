<template>
  <!-- "Modified from default": off (and saying why) while the firmware's defaults are not known. -->
  <div class="modified-filter" :title="available ? undefined : t('params.modified.unknown')">
    <Checkbox
      id="modified-only"
      :model-value="on"
      :disabled="!available"
      :aria-description="available ? undefined : t('params.modified.unknown')"
      @update:model-value="set($event)"
    >
      {{ t('params.modified.label') }}
    </Checkbox>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Checkbox from '@/components/ui/Checkbox.vue'
import { useModifiedFilter } from '@/composables/useModifiedFilter'

// The filter that lists only the parameters whose value is not the firmware's default, in the toolbar above the list. It narrows
// a search too. The defaults come with a download by file transfer from a vehicle that has them; without them it is off.
const { t } = useI18n()
const { available, on, set } = useModifiedFilter()
</script>
