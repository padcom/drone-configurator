<template>
  <nav class="rail" :aria-label="t('shell.navigation')">
    <div class="rail-main">
      <RouterLink v-for="screen in main" :key="screen.id" :to="screen.path" class="rail-item">
        <span class="rail-icon"><Icon :name="screen.icon" /></span>
        <span class="rail-label">{{ t(screen.titleKey) }}</span>
      </RouterLink>
    </div>
    <div class="rail-end">
      <RouterLink v-for="screen in end" :key="screen.id" :to="screen.path" class="rail-item">
        <span class="rail-icon"><Icon :name="screen.icon" /></span>
        <span class="rail-label">{{ t(screen.titleKey) }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
// The rail: a link to each screen, an icon over its name, the one that is shown marked (by colour and by the plain
// `aria-current`), and Settings apart at the bottom. Native links, so a keyboard reaches them in order and a screen reader
// says which screen is the current one. Below 1000 px wide it lies down on top as a row (frame.css).
import { useI18n } from 'vue-i18n'
import Icon from './kit/Icon.vue'
import { SCREENS } from './screens'

const { t } = useI18n()
const main = SCREENS.filter(screen => screen.placement !== 'end')
const end = SCREENS.filter(screen => screen.placement === 'end')
</script>
