<template>
  <div class="app" data-l="app">
    <TopBar />
    <!-- Until the Connect dialog (R5c) the connection form stays here, under the top bar. -->
    <section class="connect-strip">
      <ConnectionBar />
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
  <ConfirmDialog />
</template>

<script setup lang="ts">
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectionBar from './ConnectionBar.vue'
import Rail from './Rail.vue'
import SettingsNotice from './SettingsNotice.vue'
import ToastHost from './ToastHost.vue'
import TopBar from './TopBar.vue'

// The frame of the application: the top bar (the vehicle, the link and the live cells), the rail of screens at the left, and
// the screen. From 1000 px wide the frame is the height of the window and only the screen scrolls (frame.css). The toasts
// are in a corner of the window, over everything.
</script>
