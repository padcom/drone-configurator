// @vitest-environment node
// Nothing under src/ imports from e2e/ (the window specs and their helpers): on macOS a unit test that imported a module of
// e2e/ hung vitest for the whole 15 minutes of the job, with no log (found by bisecting the CI of the notes follow-ups). What
// both sides need goes under src/ (see src/i18n/questionLines.ts), and e2e/ imports it from there.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))

/** An import or export (or a dynamic import) whose path goes into e2e/. */
const FROM_E2E = /(?:^|\n)\s*(?:import|export)\b[^\n;]*?from\s*['"][^'"]*\be2e\//u
const DYNAMIC_E2E = /\bimport\(\s*['"][^'"]*\be2e\//u

/**
 * Every TypeScript and Vue file under a folder.
 *
 * @param folder - the folder
 * @returns the paths
 */
function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      return sources(path)
    }

    return /\.(?:ts|vue)$/u.test(entry.name) ? [path] : []
  })
}

describe('the source tree', () => {
  it('has no file that imports from e2e/', () => {
    const own = fileURLToPath(import.meta.url)
    const offenders = sources(SRC)
      .filter(path => path !== own)
      .filter(path => {
        const text = readFileSync(path, 'utf8')

        return FROM_E2E.test(text) || DYNAMIC_E2E.test(text)
      })
      .map(path => relative(SRC, path).split(sep).join('/'))

    expect(offenders).toEqual([])
  })

  it('finds the imports it is looking for (so that an empty list means something)', () => {
    expect(FROM_E2E.test('import { a } from \'../../e2e/x\'')).toBe(true)
    expect(FROM_E2E.test('x\nexport { a } from "../e2e/x"')).toBe(true)
    expect(DYNAMIC_E2E.test('await import(\'../../e2e/x\')')).toBe(true)
    expect(FROM_E2E.test('import { a } from \'./questionLines\'')).toBe(false)
  })
})
