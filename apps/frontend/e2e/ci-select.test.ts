// The test selector (.github/ci-select.mjs) with diff fixtures, and the e2e map's consistency with the real tree:
// a spec in no entry, a pattern that matches nothing, or a spec that does not exist fails here, so the map cannot rot silently.
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  FULL, SHARED_BACKEND, SITL_USE, UNIT_ONLY, backendTestsFor, dependents, globToRegExp, importsOf, listSpecs, matchesAny,
  readTree, run, select, specsFor, summaryOf, unmappedSpecs,
} from '../../../.github/ci-select.mjs'

// vitest runs in apps/frontend
const root = resolve(process.cwd(), '../..')
const tree = readTree(root)

/**
 * A path with forward slashes on every platform (Windows gives backslashes; the globs and git use slashes).
 *
 * @param path a path
 * @returns the path with `/`
 */
function slashed(path: string): string {
  return path.split(sep).join('/')
}

/**
 * The tracked-looking files of the repository (no dependencies, no build output).
 *
 * @param dir the directory to list
 * @returns paths relative to the root, with forward slashes on every platform (the globs and git use them)
 */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => !['node_modules', 'dist', '.git', 'target', 'build'].includes(entry.name))
    .flatMap(entry => entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [slashed(relative(root, join(dir, entry.name)))])
}

const files = filesUnder(root)
const input = { specs: tree.specs, sitlSpecs: tree.sitlSpecs, backend: tree.backend, map: tree.map }
const pick = (changed: string[]) => select({ files: changed, ...input })

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
    const text = 'import { a } from "./one"\nimport {\n  b,\n} from "./two"\nimport { c } from "./generated/app"'
    expect(importsOf(text)).toEqual(['one', 'two'])
  })

  it('reads an import with no names, which has no `from`', () => {
    expect(importsOf('import "./side"\nimport { a } from "./one"')).toEqual(['side', 'one'])
  })

  it('follows dependents but not the shared modules', () => {
    const imports = { a: [], b: ['a'], c: ['b'], app: ['a', 'b', 'c'], d: [] }
    expect([...dependents('a', imports, new Set(['app']))].sort()).toEqual(['a', 'b', 'c'])
  })

  it('selects the test of a module and the tests of what imports it', () => {
    const imports = { 'a': [], 'b': ['a'], 'a.test': [], 'b.test': [], 'x.test': ['a'] }
    const backend = { tests: ['a.test.pi', 'b.test.pi', 'x.test.pi'], imports }
    expect(backendTestsFor('apps/backend/a.pi', backend)).toEqual(['a.test.pi', 'b.test.pi', 'x.test.pi'])
    expect(backendTestsFor('apps/backend/b.pi', backend)).toEqual(['b.test.pi'])
    expect(backendTestsFor('apps/backend/b.test.pi', backend)).toEqual(['b.test.pi'])
    expect(backendTestsFor('apps/backend/none.pi', backend)).toBeNull()
  })
})

describe('select', () => {
  it('runs everything on a full run, an unknown diff, and shared infrastructure', () => {
    expect(select({ files: ['x'], ...input, full: true }).full).toBe(true)
    expect(pick([]).reasons[0]).toContain('unknown')

    for (const file of [
      '.github/workflows/ci.yml',
      'pnpm-lock.yaml',
      'apps/frontend/package.json',
      'packages/contracts/app.cddl',
      'apps/backend/session.pi',
      'apps/backend/generated/app.pi',
      'apps/frontend/src/main.ts',
      'apps/frontend/src/components/ui/Button.vue',
      'apps/frontend/src/i18n/locales/en.json',
      'apps/frontend/e2e/launch.ts',
      'apps/frontend/tsconfig.json',
      'examples/other/thing.ts',
    ]) {
      expect(pick([file]).full, file).toBe(true)
    }
  })
})

describe('select: what a change needs', () => {
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
})

describe('select: a backend change', () => {
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
})

describe('select: failing open, and reporting', () => {
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
    const output = run(['--root', root], 'apps/backend/params.pi\n')
    expect(output).toMatch(/full=false\nsitl=true\nbackend=.*params\.test\.pi\ne2e=.*param-/u)
    expect(run(['--root', root], '')).toMatch(/full=true\nsitl=true\nbackend=\.\ne2e=\n/u)
  })
})

describe('the e2e map and the tree', () => {
  const globs = tree.map.entries.flatMap(entry => entry.specs)
  const all = [...globs, ...tree.map.smoke, tree.map.smokeSitl]

  it('names every spec in some entry (a new spec cannot go unmapped)', () => {
    expect(unmappedSpecs(tree.specs, tree.map)).toEqual([])
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

describe('a new spec, SITL, and the shared modules', () => {
  const specs = [...tree.specs, 'brand-new.e2e.ts']

  it('finds a new spec that no entry names (this is what fails the map check)', () => {
    expect(unmappedSpecs(specs, tree.map)).toEqual(['brand-new.e2e.ts'])
  })

  it('runs a new spec in the PR that adds it, with the smoke set, whether or not the map knows it', () => {
    const changed = ['apps/frontend/e2e/brand-new.e2e.ts']
    const result = select({ files: changed, ...input, specs })
    expect(result.full).toBe(false)
    expect(result.e2e).toEqual([...new Set(['brand-new.e2e.ts', ...tree.map.smoke])].sort())
  })

  it('tells a SITL spec by what it uses and not by its name', () => {
    expect(SITL_USE.test('await withSitl(async () => {})')).toBe(true)
    expect(SITL_USE.test('const x = sitlLike()')).toBe(false)
    expect(tree.sitlSpecs).toContain(tree.map.smokeSitl)
    expect(tree.specs.filter(spec => spec.startsWith('sitl-') && !tree.sitlSpecs.includes(spec))).toEqual([])
  })

  it('keeps the shared backend modules in one list that the always-everything globs use', () => {
    for (const name of SHARED_BACKEND) {
      expect(matchesAny(`apps/backend/${name}.pi`, FULL), name).toBe(true)
    }
    expect(matchesAny('apps/backend/params.pi', FULL)).toBe(false)
  })

  it('selects no SITL smoke for a backend test file alone', () => {
    expect(pick(['apps/backend/params.test.pi']).e2e).not.toContain(tree.map.smokeSitl)
  })
})

const scratch = mkdtempSync(join(tmpdir(), 'ci-select-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/**
 * Runs git in a directory, as a throwaway author, failing the test when git does.
 *
 * @param cwd the repository
 * @param args git's arguments
 * @returns what git printed
 */
function git(cwd: string, ...args: string[]): string {
  const as = ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false']
  const result = spawnSync('git', [...as, ...args], { cwd, encoding: 'utf8' })
  expect(result.status, `git ${args.join(' ')}: ${result.stderr}`).toBe(0)

  return result.stdout
}

/**
 * A small repository with the real selector and map: a base commit on `origin/main`, then one that changes a backend module.
 *
 * @param name the directory name under the scratch directory
 * @returns the repository's path
 */
function makeRepository(name: string): string {
  const dir = join(scratch, name)
  for (const sub of ['.github', 'apps/frontend/e2e', 'apps/backend']) mkdirSync(join(dir, sub), { recursive: true })

  for (const file of ['ci-select.sh', 'ci-select.mjs', 'e2e-map.json']) {
    copyFileSync(join(root, '.github', file), join(dir, '.github', file))
  }
  writeFileSync(join(dir, 'apps/frontend/e2e/shell.e2e.ts'), '')
  writeFileSync(join(dir, 'apps/frontend/e2e/sitl.e2e.ts'), 'await withSitl(async () => {})\n')
  writeFileSync(join(dir, 'apps/backend/params.pi'), 'const A: int = 1\n')
  writeFileSync(join(dir, 'apps/backend/params.test.pi'), 'import { A } from "./params"\n')
  git(dir, 'init', '-q')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'base')
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  writeFileSync(join(dir, 'apps/backend/params.pi'), 'const A: int = 2\n')
  git(dir, 'commit', '-q', '-am', 'change')

  return dir
}

/** What the script printed, wrote to GITHUB_OUTPUT (as key/value) and wrote to GITHUB_STEP_SUMMARY. */
interface ScriptRun {
  out: string
  outputs: Record<string, string>
  summary: string
}

/**
 * Runs ci-select.sh as GitHub would, and reads the outputs file.
 *
 * @param dir the repository
 * @param env the variables GitHub sets for the event
 * @returns the script's own output, and the `key=value` lines it wrote to GITHUB_OUTPUT
 */
function runScript(dir: string, env: Record<string, string>): ScriptRun {
  const outputFile = join(dir, 'github-output')
  const summaryFile = join(dir, 'github-summary')
  const cleaned = { ...process.env, GITHUB_EVENT_NAME: '', GITHUB_BASE_REF: '' }
  const result = spawnSync('bash', ['.github/ci-select.sh', '--shadow'], {
    cwd: dir, encoding: 'utf8', env: { ...cleaned, GITHUB_OUTPUT: outputFile, GITHUB_STEP_SUMMARY: summaryFile, ...env },
  })
  expect(result.status, result.stderr).toBe(0)
  const lines = readFileSync(outputFile, 'utf8').split('\n').filter(Boolean)
  const outputs = Object.fromEntries(lines.map(line => line.split('=', 2) as [string, string]))

  return { out: result.stdout, outputs, summary: readFileSync(summaryFile, 'utf8') }
}

describe('the split of the CI jobs', () => {
  it('lists every spec once, as a SITL spec or a fake-vehicle one (the two e2e jobs together run them all)', () => {
    const sitl = listSpecs(root, 'sitl')
    const fake = listSpecs(root, 'fake')
    expect([...sitl, ...fake].sort()).toEqual(tree.specs.map(spec => `e2e/${spec}`).sort())
    expect(sitl).toContain('e2e/sitl-harness.e2e.ts')
    expect(fake).toContain('e2e/shell.e2e.ts')
    expect(fake.filter(spec => sitl.includes(spec))).toEqual([])
  })

  it.skipIf(process.platform === 'win32')('splits the backend test files into shards that cover each file once', () => {
    const shard = (n: number) => spawnSync('bash', ['.github/backend-shard.sh', `${n}`, '2'], { cwd: root, encoding: 'utf8' })
    const listed = [shard(1), shard(2)].map(result => result.stdout.split('\n').filter(Boolean))
    expect(shard(1).status).toBe(0)
    expect([...listed[0] ?? [], ...listed[1] ?? []].sort()).toEqual([...tree.backend.tests].sort())
    expect(listed.every(shardFiles => shardFiles.length > 0)).toBe(true)
    expect(shard(3).status).toBe(2)
  })
})

// bash and git are on every runner, but the Windows jobs run the unit tests only to check the selector's logic.
describe.skipIf(process.platform === 'win32')('ci-select.sh in a throwaway repository', () => {
  it('selects by the diff against origin/$GITHUB_BASE_REF on a pull request, and writes the outputs and the summary', () => {
    const { outputs, summary } = runScript(makeRepository('pr'), { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main' })
    expect(outputs).toMatchObject({ full: 'false', sitl: 'true', backend: 'params.test.pi' })
    expect(outputs.e2e).toContain('shell.e2e.ts')
    expect(summary).toContain('shadow mode: everything still runs')
  })

  it('selects everything on a push and on a manual run', () => {
    for (const event of ['push', 'workflow_dispatch']) {
      const { outputs } = runScript(makeRepository(event), { GITHUB_EVENT_NAME: event, GITHUB_BASE_REF: 'main' })
      expect(outputs).toEqual({ full: 'true', sitl: 'true', backend: '.', e2e: '' })
    }
  })

  it('selects everything, and says why, when there is no base or the diff cannot be read', () => {
    const noBase = runScript(makeRepository('nobase'), { GITHUB_EVENT_NAME: 'pull_request' })
    expect(noBase.outputs.full).toBe('true')
    const event = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'nonexistent' }
    const unreadable = runScript(makeRepository('unreadable'), event)
    expect(unreadable.out).toContain('::warning::cannot read the diff against origin/nonexistent')
    expect(unreadable.outputs).toMatchObject({ full: 'true', backend: '.', e2e: '' })
    expect(unreadable.summary).toContain('unknown')
  })

  it('tells a SITL spec by its content in the tree it reads', () => {
    expect(readTree(join(scratch, 'pr')).sitlSpecs).toEqual(['sitl.e2e.ts'])
  })
})
