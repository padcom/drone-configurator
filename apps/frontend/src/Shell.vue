<template>
  <div class="app" data-l="app">
    <header>
      <h1>{{ t('app.title') }}</h1>
      <ConnectionBar />
    </header>
    <SettingsNotice />
    <div class="app-row">
      <Rail />
      <main class="app-main">
        <!-- A screen that was shown stays alive while another is, so what is typed or selected in it is still there when
             the user comes back. -->
        <RouterView v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
    <StatusBar />
  </div>
  <ConfirmDialog />
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectionBar from './ConnectionBar.vue'
import Rail from './Rail.vue'
import SettingsNotice from './SettingsNotice.vue'
import StatusBar from './StatusBar.vue'

// The frame of the application: the title and the connection on top, the rail of screens at the left, the screen, and the
// status bar at the bottom. From 1000 px wide the frame is the height of the window and only the screen scrolls (frame.css).
const { t } = useI18n()
</script>
