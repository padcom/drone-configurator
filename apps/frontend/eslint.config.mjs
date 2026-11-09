// The lint rules of padcom/vue-template (@padcom/eslint-config-vue), for the browser. Every new
// .vue and .ts file is checked by all of them, none is weakened.
import config from '@padcom/eslint-config-vue'

/**
 * Files written before these rules were adopted (#11). They still break some of them (JSDoc on every
 * member, a complexity of at most 4, functions of at most 32 lines, no `await` in a loop ...), which
 * needs real refactoring, not formatting. They are not checked until they are brought up to the rules;
 * do that file by file and take it off this list when you do. A file the Vue rebuild (#11) replaces
 * leaves the list when it is deleted.
 */
const NOT_YET_LINTED = [
  'e2e/announced-port.test.ts',
  'e2e/announced-port.ts',
  'e2e/backend-crash.e2e.ts',
  'e2e/click.ts',
  'e2e/configurator.e2e.ts',
  'e2e/endpoint.test.ts',
  'e2e/endpoint.ts',
  'e2e/live-vehicle.ts',
  'e2e/mavlink-wire.ts',
  'e2e/sitl-harness.e2e.ts',
  'e2e/sitl-suite.ts',
  'e2e/sitl.e2e.ts',
  'e2e/sitl.test.ts',
  'e2e/sitl.ts',
  'e2e/tcp-vehicle.ts',
  'src/configurator.test.ts',
  'src/configurator.ts',
  'src/fixtures.ts',
  'src/main.ts',
  'src/metadata.test.ts',
  'src/metadata.ts',
  'src/mock-backend.ts',
  'src/render.test.ts',
  'src/render.ts',
  'src/snapshot.test.ts',
  'src/snapshot.ts',
]

export default [
  { ignores: ['**/dist/**', '**/dist-csp-test/**', '**/generated/**', ...NOT_YET_LINTED] },
  ...config['flat/browser'],
]
