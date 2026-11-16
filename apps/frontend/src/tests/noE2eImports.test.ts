// Nothing under src/ imports from e2e/ (the window specs and their helpers): on macOS a unit test that imported a module of
// e2e/ hung vitest for the whole 15 minutes of the job, with no log (found by bisecting the CI of the notes follow-ups). What
// both sides need goes under src/ (see src/i18n/questionLines.ts), and e2e/ imports it from there.
// (The files are read by Vite's own glob, not by `fs` and `import.meta.url`: that construct is what hung there.)
import { describe, expect, it } from 'vitest'

/** Every source file of src/, as text. */
const SOURCES = import.meta.glob<string>('/src/**/*.{ts,vue}', { query: '?raw', import: 'default', eager: true })

/**
 * A quoted path that goes into e2e/, after one of these (whitespace and line breaks allowed between):
 * `from` (an import or export, wrapped or not), `import` (bare, or dynamic with a parenthesis), `vi.mock`, `vi.doMock`,
 * `vi.importActual`, `require(`.
 */
const INTO_E2E: RegExp[] = [
  /\bfrom\s*['"][^'"]*\be2e\//u,
  /\bimport\s*\(?\s*['"][^'"]*\be2e\//u,
  /\bvi\s*\.\s*(?:mock|doMock|importActual)\s*\(\s*['"][^'"]*\be2e\//u,
  /\brequire\s*\(\s*['"][^'"]*\be2e\//u,
]

/**
 * Whether a source imports from e2e/.
 *
 * @param text - the source
 * @returns true when it does
 */
function importsE2e(text: string): boolean {
  return INTO_E2E.some(pattern => pattern.test(text))
}

describe('the source tree', () => {
  it('has no file that imports from e2e/', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith('/tests/noE2eImports.test.ts'))
      .filter(([, text]) => importsE2e(text))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })

  it('sees the source files it is looking at (so that an empty list means something)', () => {
    const paths = Object.keys(SOURCES)

    expect(paths.length > 100).toBe(true)
    expect(paths).toContain('/src/i18n/questionLines.ts')
  })

  it('finds every form of import it is looking for', () => {
    expect(importsE2e('import { a } from \'../../e2e/x\'')).toBe(true)
    expect(importsE2e('import {\n  a,\n  b,\n} from \'../e2e/x\'')).toBe(true)
    expect(importsE2e('import type { A } from "../e2e/x"')).toBe(true)
    expect(importsE2e('x\nexport { a } from "../e2e/x"')).toBe(true)
    expect(importsE2e('export * from \'../e2e/x\'')).toBe(true)
    expect(importsE2e('import \'../e2e/x\'')).toBe(true)
    expect(importsE2e('await import(\'../../e2e/x\')')).toBe(true)
    expect(importsE2e('vi.mock(\'../../e2e/x\', () => ({}))')).toBe(true)
    expect(importsE2e('vi.mock(\n  "../../e2e/x",\n)')).toBe(true)
    expect(importsE2e('const a = require(\'../e2e/x\')')).toBe(true)
    expect(importsE2e('import { a } from \'./questionLines\'')).toBe(false)
    expect(importsE2e('// the window specs in e2e/ use it')).toBe(false)
  })
})
