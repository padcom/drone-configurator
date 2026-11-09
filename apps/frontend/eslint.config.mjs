// The lint rules of padcom/vue-template (@padcom/eslint-config-vue), for the browser. Every new
// .vue and .ts file is checked by all of them, none is weakened.
import { readFileSync } from 'node:fs'
import config from '@padcom/eslint-config-vue'

// Files written before the rules (#11) that still break some of them: eslint-baseline.txt says why,
// and src/lint-baseline.test.ts makes sure the list only shrinks.
const notYetLinted = readFileSync(new URL('eslint-baseline.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter(line => line !== '' && !line.startsWith('#'))

export default [
  { ignores: ['**/dist/**', '**/dist-csp-test/**', '**/generated/**', ...notYetLinted] },
  ...config['flat/browser'],
]
