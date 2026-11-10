import { defineConfig } from 'pico-desktop'

// The standard layout needs no more: apps/frontend (Vite), apps/backend (Pico), and the contract
// in packages/contracts/app.cddl (generated into both by `pico-desktop generate`).
export default defineConfig({
  app: { id: 'dev.pico-desktop.drone-configurator', name: 'drone-configurator', version: '0.1.0' },
  // The host's native services the backend may use (Host in pico-desktop/communicator): window,
  // dialogs, notifications. Anything not listed fails with NOT_ALLOWED.
  capabilities: ['window', 'dialogs'],
  // The window opens at the size the interface is designed for (the default is 1024x768). It can be resized: below 1000 px
  // wide the narrower layouts take over. (pico-desktop has no option for a minimum size.)
  window: { width: 1440, height: 900 },
})
