<template>
  <div class="app" data-l="app">
    <TopBar />
    <section class="connect-strip">
      <ConnectionStatus />
    </section>
    <SettingsNotice />
    <div class="app-row">
      <Rail />
      <main class="app-main" tabindex="-1">
        <!-- A screen that was shown stays alive while another is, so what is typed or selected in it is still there when
             the user comes back. -->
        <!-- Keyed by the screen: the screens that are not built share one component, and a heading that changes in a
             component that stays is not announced, while a new one is found. -->
        <RouterView v-slot="{ Component, route }">
          <KeepAlive>
            <component :is="Component" :key="String(route.name)" />
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
import { usePaneKeys } from './paneFocus'
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectDialog from './ConnectDialog.vue'
import ConnectionStatus from './ConnectionStatus.vue'
import Rail from './Rail.vue'
import SettingsNotice from './SettingsNotice.vue'
import ToastHost from './ToastHost.vue'
import TopBar from './TopBar.vue'

/** The regions F6 goes through, in the order they are in the page (the aside only exists on the Fly screen). */
const REGIONS = '.rail, .app-main, .fly-aside'

// The frame of the application: the top bar (the vehicle, the link and the live cells), the rail of screens at the left, and
// the screen. From 1000 px wide the frame is the height of the window and only the screen scrolls (frame.css). The toasts
// are in a corner of the window, over everything. F6 and Shift+F6 move the focus between the rail, the screen and the aside
// of the Fly screen.
usePaneKeys(REGIONS)
</script>
