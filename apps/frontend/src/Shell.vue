<template>
  <div class="app" data-l="app">
    <TopBar />
    <section class="connect-strip">
      <ConnectionStatus />
    </section>
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
  </div>
  <ToastHost />
  <ConnectDialog />
  <ConfirmDialog />
</template>

<script setup lang="ts">
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectDialog from './ConnectDialog.vue'
import ConnectionStatus from './ConnectionStatus.vue'
import Rail from './Rail.vue'
import SettingsNotice from './SettingsNotice.vue'
import ToastHost from './ToastHost.vue'
import TopBar from './TopBar.vue'

// The frame of the application: the top bar (the vehicle, the link and the live cells), the rail of screens at the left, and
// the screen. From 1000 px wide the frame is the height of the window and only the screen scrolls (frame.css). The toasts
// are in a corner of the window, over everything.
</script>
