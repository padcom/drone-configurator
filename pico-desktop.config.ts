import { defineConfig } from 'pico-desktop'

// The standard layout needs no more: apps/frontend (Vite), apps/backend (Pico), and the contract
// in packages/contracts/app.cddl (generated into both by `pico-desktop generate`).
export default defineConfig({
  app: { id: 'dev.pico-desktop.drone-configurator', name: 'drone-configurator', version: '0.1.0' },
  // The host's native services the backend may use (Host in pico-desktop/communicator): window,
  // dialogs, notifications. Anything not listed fails with NOT_ALLOWED.
  capabilities: ['window'],
})
