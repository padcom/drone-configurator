import '@/assets/styles/fonts.css'
import '@/assets/styles/tokens.css'
import '@/assets/styles/kit.css'
import '@/assets/styles/panels.css'
import '@/assets/styles/dialog.css'
import '@/assets/styles/surfaces.css'
import '@/assets/styles/forms.css'
import '@/assets/styles/feedback.css'
import '@/assets/styles/frame.css'
import '@/assets/styles/topBar.css'
import '@/assets/styles/connectDialog.css'
import '@/assets/styles/palette.css'
import '@/assets/styles/fly.css'
import '@/components/fly/hud/hud.css'
import '@/assets/styles/params.css'
import '@/assets/styles/paramDetail.css'
import '@/assets/styles/snapshots.css'
import '@/assets/styles/style.css'
import { bridgeTransport } from '@pico-desktop/communicator'
import { createApp } from 'vue'
import { i18n, startInRememberedLanguage, storageOf } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
import { createAppRouter } from './router'
import Shell from '@/components/shell/Shell.vue'
import { createConfigurator } from '@/composables/useConfigurator'

// The language shown last, before the first paint (the settings are read a moment later and decide).
startInRememberedLanguage(storageOf(window))
document.title = i18n.global.t('app.title')

// In Pico Desktop the native bridge; in a plain browser (`pnpm ui`) the mock backend.
const bridge = window.picoDesktop
createConfigurator(bridge ? bridgeTransport(bridge) : mockBackend())

createApp(Shell).use(i18n).use(createAppRouter()).mount('#app')
