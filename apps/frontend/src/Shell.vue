<template>
  <header>
    <h1>{{ t('app.title') }}</h1>
    <ConnectionBar />
  </header>
  <nav :aria-label="t('shell.navigation')">
    <RouterLink v-for="screen in SCREENS" :key="screen.id" :to="screen.path">{{ t(screen.titleKey) }}</RouterLink>
  </nav>
  <!-- A screen that was shown stays alive while another is, so what is typed or selected in it is still there when
       the user comes back. -->
  <RouterView v-slot="{ Component }">
    <KeepAlive>
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
  <ConfirmDialog />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectionBar from './ConnectionBar.vue'
import { SCREENS } from './screens'

// The frame of the application: the title and the connection on top, the screens to choose from, and the screen.
const { t } = useI18n()
</script>
