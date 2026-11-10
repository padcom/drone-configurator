<template>
  <SegmentedControl
    v-if="available"
    id="param-view"
    v-model="chosen"
    :label="t('params.view.label')"
    :options="options"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SegmentedControl from './kit/SegmentedControl.vue'
import type { View } from './paramView'
import { useParamView } from './useParamView'

// The choice between the standard parameters and all of them, when the loaded metadata says which are which.
const { t } = useI18n()
const { available, view, choose } = useParamView()
const options = computed(() => [
  { value: 'standard', label: t('params.view.standard') },
  { value: 'full', label: t('params.view.full') },
])
const chosen = computed({
  get: () => view.value,
  set: (value: string) => void choose(value as View),
})
</script>
