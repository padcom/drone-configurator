<template>
  <SegmentedControl id="theme-switch" v-model="chosen" :label="t('theme.label')" :options="options" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ThemeName } from './generated/app'
import SegmentedControl from './kit/SegmentedControl.vue'
import { useTheme } from './kit/useTheme'
import { useConfigurator } from './useConfigurator'

// The choice of the page's colours: the system's (light or dark, as it asks), or one of the two. It is shown at once
// and kept in the settings, so the next start has it.
const { t } = useI18n()
const { settings } = useConfigurator()
const theme = useTheme()
const THEMES: ThemeName[] = ['system', 'light', 'dark']
const options = computed(() => THEMES.map(value => ({ value, label: t(`theme.${value}`) })))
const chosen = computed({
  get: () => theme.choice.value,
  set: (next: string) => {
    void settings.chooseTheme(next as ThemeName)
  },
})
</script>
