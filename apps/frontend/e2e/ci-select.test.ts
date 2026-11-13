// The test selector (.github/ci-select.mjs) with diff fixtures, and the e2e map's consistency with the real tree: a spec in no entry,
// a pattern that matches nothing, or a spec that does not exist fails here, so the map cannot rot silently.
import { readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FULL, UNIT_ONLY, backendTestsFor, dependents, globToRegExp, importsOf, matchesAny, readTree, run, select, specsFor, summaryOf,
} from '../../../.github/ci-select.mjs'

// vitest runs in apps/frontend
const root = resolve(process.cwd(), '../..')
const tree = readTree(root)

/**
 * The tracked-looking files of the repository (no dependencies, no build output).
 * @param dir the directory to list
 * @returns paths relative to the root
 */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => !['node_modules', 'dist', '.git', 'target', 'build'].includes(entry.name))
    .flatMap(entry => entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [relative(root, join(dir, entry.name))])
}

const files = filesUnder(root)
const pick = (changed: string[]) => select({ files: changed, specs: tree.specs, backend: tree.backend, map: tree.map })

describe('globs', () => {
  it('matches ** across directories, * inside one, and {a,b}', () => {
    expect(globToRegExp('a/**').test('a/b/c.ts')).toBe(true)
    expect(globToRegExp('a/*.ts').test('a/b/c.ts')).toBe(false)
    expect(globToRegExp('**/package.json').test('package.json')).toBe(true)
    expect(globToRegExp('**/package.json').test('apps/x/package.json')).toBe(true)
    expect(globToRegExp('apps/{a,b}.pi').test('apps/b.pi')).toBe(true)
    expect(globToRegExp('a.b').test('axb')).toBe(false)
    expect(matchesAny('x.md', ['**/*.md'])).toBe(true)
  })
})

describe('backend imports', () => {
  it('reads single and multi-line imports', () => {
    expect(importsOf('import { a } from "./one"\nimport {\n  b,\n} from "./two"\nimport { c } from "./generated/app"')).toEqual(['one', 'two'])
  })

  it('follows dependents but not the shared modules', () => {
    const imports = { a: [], b: ['a'], c: ['b'], app: ['a', 'b', 'c'], d: [] }
    expect([...dependents('a', imports, new Set(['app']))].sort()).toEqual(['a', 'b', 'c'])
  })

  it('selects the test of a module and the tests of what imports it', () => {
    const backend = { tests: ['a.test.pi', 'b.test.pi', 'x.test.pi'], imports: { a: [], b: ['a'], 'a.test': [], 'b.test': [], 'x.test': ['a'] } }
    expect(backendTestsFor('apps/backend/a.pi', backend)).toEqual(['a.test.pi', 'b.test.pi', 'x.test.pi'])
    expect(backendTestsFor('apps/backend/b.pi', backend)).toEqual(['b.test.pi'])
    expect(backendTestsFor('apps/backend/b.test.pi', backend)).toEqual(['b.test.pi'])
    expect(backendTestsFor('apps/backend/none.pi', backend)).toBeNull()
  })
})

describe('select', () => {
  it('runs everything on a full run, an unknown diff, and shared infrastructure', () => {
    expect(select({ files: ['x'], specs: tree.specs, backend: tree.backend, map: tree.map, full: true }).full).toBe(true)
    expect(pick([]).reasons[0]).toContain('unknown')
    for (const file of [
      '.github/workflows/ci.yml', 'pnpm-lock.yaml', 'apps/frontend/package.json', 'packages/contracts/app.cddl', 'apps/backend/session.pi',
      'apps/backend/generated/app.pi', 'apps/frontend/src/main.ts', 'apps/frontend/src/components/ui/Button.vue', 'apps/frontend/src/i18n/locales/en.json',
      'apps/frontend/e2e/launch.ts', 'apps/frontend/tsconfig.json', 'examples/other/thing.ts',
    ]) {
      expect(pick([file]).full, file).toBe(true)
    }
  })

  it('runs no e2e for a document or a unit test, and a mixed diff selects only by its code', () => {
    const docs = pick(['README.md', 'docs/a/b.md'])
    expect(docs).toMatchObject({ full: false, backend: [], e2e: [], sitl: false })
    expect(pick(['apps/frontend/src/lib/params/x.test.ts', 'apps/frontend/src/mock/fixtures.ts']).e2e).toEqual([])
  })

  it('selects a changed spec and the smoke set', () => {
    const result = pick(['apps/frontend/e2e/language.e2e.ts'])
    expect(result.e2e).toEqual([...new Set(['language.e2e.ts', ...tree.map.smoke])].sort())
  })

  it('maps a screen change to its specs plus the smoke set, with no SITL and no backend tests', () => {
    const result = pick(['apps/frontend/src/components/setup/CalibrationNotice.vue'])
    expect(result.full).toBe(false)
    expect(result.e2e).toEqual(expect.arrayContaining(['setup.e2e.ts', 'frame.e2e.ts', ...tree.map.smoke]))
    expect(result.e2e).not.toContain('vehicle-logs.e2e.ts')
    expect(result).toMatchObject({ backend: [], sitl: false })
  })

  it('maps a backend module to its tests, its specs, SITL and the smoke SITL spec', () => {
    const result = pick(['apps/backend/locallogs.pi'])
    expect(result.full).toBe(false)
    expect(result.backend).toEqual(expect.arrayContaining(['locallogs.test.pi', 'localimport.test.pi']))
    expect(result.e2e).toEqual(expect.arrayContaining(['vehicle-logs.e2e.ts', 'sitl-logs.e2e.ts', 'sitl.e2e.ts']))
    expect(result.sitl).toBe(true)
  })

  it('selects a changed backend test file alone, with no e2e', () => {
    const result = pick(['apps/backend/params.test.pi'])
    expect(result.backend).toEqual(['params.test.pi'])
    expect(result.e2e).toEqual(expect.arrayContaining(tree.map.smoke))
  })

  it('falls open when a source is in no entry and shares no name with a spec', () => {
    const result = pick(['apps/frontend/src/lib/ui/zzzzz.ts'])
    expect(result.full).toBe(true)
    expect(result.reasons[0]).toContain('e2e-map.json')
  })

  it('places an unmapped source by the name it shares with a spec', () => {
    expect(specsFor('apps/frontend/src/lib/ui/palette.ts', tree.map, tree.specs)).toEqual(['palette.e2e.ts'])
    expect(specsFor('apps/frontend/src/lib/ui/zz.ts', tree.map, tree.specs)).toBeNull()
  })

  it('reports the choice, and says so when it is a shadow', () => {
    const text = summaryOf(pick(['apps/backend/params.pi']), { specs: 34, tests: 28, files: 1, shadow: true })
    expect(text).toContain('shadow mode: everything still runs')
    expect(text).toMatch(/Would run \d+ of 34 e2e specs and \d+ of 28 backend test files/u)
    expect(summaryOf(pick(['pnpm-lock.yaml']), { specs: 34, tests: 28, files: 1, shadow: false })).toContain('Everything')
  })

  it('writes the outputs on the command line, and everything when the diff is empty', () => {
    expect(run(['--root', root], 'apps/backend/params.pi\n')).toMatch(/full=false\nsitl=true\nbackend=.*params\.test\.pi\ne2e=.*param-/u)
    expect(run(['--root', root], '')).toMatch(/full=true\nsitl=true\nbackend=\.\ne2e=\n/u)
  })
})

describe('the e2e map and the tree', () => {
  const globs = tree.map.entries.flatMap(entry => entry.specs)
  const all = [...globs, ...tree.map.smoke, tree.map.smokeSitl]

  it('names every spec in some entry (a new spec cannot go unmapped)', () => {
    const unmapped = tree.specs.filter(spec => !matchesAny(spec, globs))
    expect(unmapped).toEqual([])
  })

  it('matches at least one spec for every spec pattern, so a deleted or renamed spec fails (not a stale map)', () => {
    const stale = all.filter(glob => !tree.specs.some(spec => matchesAny(spec, [glob])))
    expect(stale).toEqual([])
  })

  it('matches at least one file for every `when` pattern', () => {
    const stale = tree.map.entries.flatMap(entry => entry.when).filter(glob => !files.some(file => matchesAny(file, [glob])))
    expect(stale).toEqual([])
  })

  it('keeps the smoke specs among the specs', () => {
    expect(tree.map.smoke.every(spec => tree.specs.includes(spec))).toBe(true)
    expect(tree.specs).toContain(tree.map.smokeSitl)
  })

  it('has no pattern that is both always-everything and unit-only', () => {
    expect(UNIT_ONLY.filter(glob => FULL.includes(glob))).toEqual([])
  })
})
