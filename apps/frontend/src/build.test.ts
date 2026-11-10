// @vitest-environment node
// The built frontend must satisfy the production CSP (`script-src 'self'; style-src 'self'`):
// no inline script or style, CSS from a linked file, and no eval or `new Function` in the bundle.
// (The node environment: this test reads the build from disk, and jsdom's `import.meta.url` isn't a file URL.)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'dist-csp-test')

/**
 * Builds the frontend like `pnpm build` does.
 *
 * @returns the built index.html, the names of its files, and the JavaScript and the CSS of all its chunks
 */
async function buildFrontend() {
  // Vitest sets NODE_ENV=test, and Vite takes `import.meta.env.DEV` from NODE_ENV: without this the "production" build
  // here would be a development build (with the component gallery in it). `pnpm build` has NODE_ENV=production.
  const before = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  try {
    await build({ root, logLevel: 'silent', mode: 'production', build: { outDir: out, emptyOutDir: true } })
  } finally {
    if (before === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = before
    }
  }
  const assets = join(out, 'assets')
  const files = readdirSync(assets)
  const text = (extension: string) => {
    const named = files.filter(f => f.endsWith(extension))

    return named.map(f => readFileSync(join(assets, f), 'utf8')).join('\n')
  }

  return {
    html: readFileSync(join(out, 'index.html'), 'utf8'),
    files,
    js: text('.js'),
    css: text('.css'),
  }
}

let built = { html: '', files: [] as string[], js: '', css: '' }

beforeAll(async () => {
  built = await buildFrontend()
}, 120_000)

describe('the production build', () => {
  it('has no inline script or style', () => {
    expect(built.html).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/iu)
    expect(built.html).not.toMatch(/<style[\s>]/iu)
    expect(built.html).not.toMatch(/\sstyle=/iu)
    expect(built.html).not.toMatch(/\son[a-z]+=/iu)
  })

  it('links its CSS from a file', () => {
    expect(built.html).toMatch(/<link[^>]+rel="stylesheet"[^>]+href="\.\/assets\/[^"]+\.css"/iu)
    expect(existsSync(join(out, 'assets'))).toBe(true)
  })

  it('hoists no inline style attribute into the JavaScript', () => {
    // Markup written as a string with style="…" is parsed at run time, which `style-src 'self'`
    // blocks. (Bind a class instead.)
    expect(built.js).not.toMatch(/\sstyle\s*=\s*\\?["']/u)
  })

  it('has no eval or new Function', () => {
    expect(built.js).not.toMatch(/\beval\s*\(/u)
    expect(built.js).not.toMatch(/new Function\s*\(/u)
  })
})

describe('the production build and the component gallery', () => {
  it('has the screens of the product as chunks of their own, loaded when first shown', () => {
    expect(built.files.some(f => f.startsWith('Parameters-') && f.endsWith('.js'))).toBe(true)
    expect(built.files.some(f => f.startsWith('FlightData-') && f.endsWith('.js'))).toBe(true)
  })

  it('has no gallery: no chunk, none of its markup, none of its styles', () => {
    expect(built.files.filter(f => /gallery/iu.test(f))).toEqual([])
    // `gallery-why` is an id that only the gallery's template has; `.swatch` is a class only its stylesheet has.
    expect(built.js).not.toContain('gallery-why')
    expect(built.js).not.toContain('screens/Gallery')
    expect(built.css).not.toContain('.swatch')
    expect(built.css).not.toContain('.gallery')
  })

  it('does have the controls\' own styles, which the product will use', () => {
    // The check above would also pass on an empty build; this one shows that the CSS is there to be looked in.
    expect(built.css).toContain('.kit-button')
    expect(built.css).toContain('.kit-split')
  })
})

describe('the fonts in the production build', () => {
  it('has IBM Plex Sans in four weights and IBM Plex Mono in three, as woff2 files of its own', () => {
    expect(built.files.filter(f => /^ibm-plex-sans-latin-(?:400|500|600|700)-normal-.+\.woff2$/u.test(f))).toHaveLength(4)
    expect(built.files.filter(f => /^ibm-plex-mono-latin-(?:400|500|600)-normal-.+\.woff2$/u.test(f))).toHaveLength(3)
    expect(built.css).toContain('font-family:IBM Plex Sans')
    expect(built.css).toContain('font-family:IBM Plex Mono')
  })

  it('fetches nothing from the network: every font and every URL in the CSS is the app\'s own', () => {
    expect(built.css).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//iu)
    expect(built.css).not.toMatch(/@import/iu)
    expect(built.html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/iu)
    expect(built.js).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/iu)
  })
})

describe('the messages in the production build', () => {
  it('are in the bundle, precompiled, so vue-i18n needs no message compiler', () => {
    // The document title comes from src/locales/en.json through vue-i18n, so the messages are in the bundle.
    expect(built.js).toContain('Drone Configurator')
    // The message compiler is what would need `new Function`: the runtime-only build leaves it out.
    expect(built.js).not.toMatch(/compileToFunction|Function\(/u)
  })

  it('leave eval and new Function out although vue-i18n is bundled', () => {
    expect(built.js).not.toMatch(/\beval\s*\(/u)
    expect(built.js).not.toMatch(/new\s+Function\b/u)
    expect(built.js).not.toMatch(/\bFunction\s*\(\s*["'`]/u)
  })
})
