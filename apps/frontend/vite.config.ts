import { fileURLToPath } from 'node:url'
import vueI18n from '@intlify/unplugin-vue-i18n/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// The production CSP is `script-src 'self'; style-src 'self'`, and this build satisfies it:
// - the runtime-only Vue build (no template compiler, so no `new Function`/eval) with the SFC
//   templates compiled at build time by @vitejs/plugin-vue;
// - the CSS extracted to a file and linked from index.html (no <style> injected at run time);
// - the Vue feature flags set here, so the bundler build doesn't warn about them. NOTE:
//   __VUE_OPTIONS_API__ is false in dev, tests and production alike, so components must use
//   <script setup> or the Composition API: `data`, `methods`, `computed` options are ignored
//   without an error.
// - the messages in src/locales precompiled to functions by @intlify/unplugin-vue-i18n and vue-i18n's runtime-only
//   build, so there is no message compiler (and no `new Function`) in the bundle; the i18n feature flags are set
//   for the same reason as Vue's.
// `pnpm dev` loads Vite's own origin, which has no host CSP, so Vite's injected styles and HMR
// work there; the production policy isn't weakened for it (pico-desktop's docs/tutorial.md).
export default defineConfig({
  // Relative asset URLs: the host serves the built frontend from its own origin.
  base: './',
  plugins: [
    vue(),
    vueI18n({
      // Glob patterns use forward slashes: on Windows the path from fileURLToPath has backslashes, which would
      // make nothing match (and the messages would not be precompiled).
      include: [fileURLToPath(new URL('src/locales/**', import.meta.url)).replaceAll('\\', '/')],
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: false,
      strictMessage: true,
    }),
  ],
  define: {
    __VUE_I18N_FULL_INSTALL__: 'false',
    __VUE_I18N_LEGACY_API__: 'false',
    __INTLIFY_PROD_DEVTOOLS__: 'false',
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  build: {
    cssCodeSplit: false,
    // Scripts only from files, never inlined as data: URLs.
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
  },
})
