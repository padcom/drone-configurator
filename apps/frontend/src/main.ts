import './kit/fonts.css'
import './kit/tokens.css'
import './kit/kit.css'
import './kit/panels.css'
import './kit/dialog.css'
import './kit/surfaces.css'
import './kit/forms.css'
import './kit/feedback.css'
import './style.css'
import { bridgeTransport } from '@pico-desktop/communicator'
import { createApp } from 'vue'
import { i18n } from './i18n'
import { mockBackend } from './mock-backend'
import { createAppRouter } from './router'
import Shell from './Shell.vue'
import { createConfigurator } from './useConfigurator'

document.title = i18n.global.t('app.title')

// In Pico Desktop the native bridge; in a plain browser (`pnpm ui`) the mock backend.
const bridge = window.picoDesktop
createConfigurator(bridge ? bridgeTransport(bridge) : mockBackend())

createApp(Shell).use(i18n).use(createAppRouter()).mount('#app')
