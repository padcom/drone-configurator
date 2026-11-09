// The lint rules of padcom/vue-template (@padcom/eslint-config-vue), for the browser. Every new
// .vue and .ts file is checked by all of them, none is weakened.
import { readFileSync } from 'node:fs'
import vueI18n from '@intlify/eslint-plugin-vue-i18n'
import config from '@padcom/eslint-config-vue'

// Files written before the rules (#11) that still break some of them: eslint-baseline.txt says why,
// and src/lint-baseline.test.ts makes sure the list only shrinks.
const notYetLinted = readFileSync(new URL('eslint-baseline.txt', import.meta.url), 'utf8')
  .split(/\r?\n/u)
  .map(line => line.trim())
  .filter(line => line !== '' && !line.startsWith('#'))

// Every user-visible string goes through vue-i18n (#18). Only the plugin and its rules are taken from the plugin's
// own flat configs: they also set parsers and globals for all files, which the padcom rules already do.
const i18n = [
  {
    name: 'drone-configurator:i18n',
    files: ['src/**/*.vue', 'src/**/*.ts'],
    ignores: ['src/**/*.test.ts', 'src/mock-backend.ts', 'src/fixtures.ts'],
    plugins: { '@intlify/vue-i18n': vueI18n },
    settings: {
      'vue-i18n': {
        localeDir: 'src/locales/*.json',
        messageSyntaxVersion: '^11.0.0',
      },
    },
    rules: {
      // No literal text in a template (what the user reads comes from src/locales/en.json) ...
      '@intlify/vue-i18n/no-raw-text': ['error', { ignorePattern: '^[^\\p{L}]+$' }],
      // ... and every key a component asks for exists. (Functions that take a `translate` are covered by
      // src/i18n-keys.test.ts.)
      '@intlify/vue-i18n/no-missing-keys': 'error',
      '@intlify/vue-i18n/no-v-html': 'error',
      '@intlify/vue-i18n/no-deprecated-tc': 'error',
      '@intlify/vue-i18n/no-deprecated-v-t': 'error',
    },
  },
]

// Components and composables never see the Communicator (docs/frontend-state.md): they call the backend through the
// client in src/backend. Types may be imported anywhere; main.ts picks the transport (the host's bridge, or the mock).
const backendBoundary = [
  {
    name: 'drone-configurator:backend-boundary',
    files: ['src/**/*.vue', 'src/**/*.ts'],
    ignores: ['src/backend/**', 'src/**/*.test.ts', 'src/main.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@pico-desktop/communicator',
          allowTypeImports: true,
          message: 'Call the backend through the client in src/backend/client.ts, not the Communicator (docs/frontend-state.md).',
        }],
      }],
    },
  },
]

export default [
  { ignores: ['**/dist/**', '**/dist-csp-test/**', '**/generated/**', ...notYetLinted] },
  ...config['flat/browser'],
  ...i18n,
  ...backendBoundary,
]
