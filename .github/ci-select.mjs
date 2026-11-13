// Chooses the tests a pull request needs, from the files it changes (the plan: shared/decisions/drone-configurator-ci-strategy.md).
// Plain Node, no dependencies. `select()` is a pure function (unit-tested with diff fixtures in apps/frontend/e2e/ci-select.test.ts);
// the command line (ci-select.sh) feeds it the changed file names on stdin and the files of the working tree.
//
// The rule is "fail open": whatever cannot be placed selects everything. A wrong map costs time, never safety.
import { appendFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Changes that always run everything: shared infrastructure, the contract, the kit, the backend's shared modules. */
export const FULL = [
  '.github/**', 'pnpm-lock.yaml', '**/package.json', 'pnpm-workspace.yaml', 'pico-desktop.config.ts', 'project.json',
  'packages/contracts/**', 'apps/backend/project.json', 'apps/backend/generated/**',
  'apps/backend/{app,main,session,testing,test-frontend,guarded}.pi',
  'apps/frontend/{vite,vitest}.config.ts', '**/tsconfig*.json', '**/eslint.config.*', 'apps/frontend/index.html',
  'apps/frontend/src/{main,router,test-setup}.ts', 'apps/frontend/src/{backend,state,generated}/**',
  'apps/frontend/src/components/ui/**', 'apps/frontend/src/assets/**', 'apps/frontend/src/i18n/**',
]

/** Changes that need no test beyond what always runs (lint, type checks, all unit tests): documents, the lint baseline, test fixtures. */
export const UNIT_ONLY = [
  '**/*.md', 'docs/**', 'LICENSE', 'apps/frontend/eslint-baseline.txt', 'apps/frontend/src/{mock,testing,tests}/**',
  'apps/frontend/src/**/*.test.ts', 'apps/frontend/e2e/*.test.ts',
]

const SPEC = /^apps\/frontend\/e2e\/([^/]+\.e2e\.ts)$/u
const E2E_DIR = 'apps/frontend/e2e/'
const BACKEND_DIR = 'apps/backend/'
const SOURCE = /^apps\/(?:backend\/[^/]+\.pi|frontend\/src\/.+)$/u
const SITL = /^sitl[.-]/u

/**
 * Turns a glob into a RegExp: `**` any depth, `*` and `?` inside one path segment, `{a,b}` alternatives.
 * @param {string} glob the pattern
 * @returns {RegExp} the pattern as a regular expression for a whole path
 */
export function globToRegExp(glob) {
  const body = glob
    .replace(/[.+^$()|[\]\\]/gu, '\\$&')
    .replace(/\*\*\//gu, '\u0000')
    .replace(/\*\*/gu, '\u0001')
    .replace(/\*/gu, '[^/]*')
    .replace(/\?/gu, '[^/]')
    .replace(/\{([^}]*)\}/gu, (_, alternatives) => `(?:${alternatives.replace(/,/gu, '|')})`)
    .replace(/\u0000/gu, '(?:.*/)?')
    .replace(/\u0001/gu, '.*')
  return new RegExp(`^${body}$`, 'u')
}

/**
 * Whether a path matches any of the globs.
 * @param {string} file a path relative to the repository root
 * @param {string[]} globs patterns
 * @returns {boolean} true when one matches
 */
export function matchesAny(file, globs) {
  return globs.some(glob => globToRegExp(glob).test(file))
}

/**
 * The names a source module is imported by: `from "./x"` anywhere in a file (also in a multi-line import).
 * @param {string} text the content of a `.pi` file
 * @returns {string[]} the module names without `./`
 */
export function importsOf(text) {
  return [...text.matchAll(/from\s+"\.\/([A-Za-z0-9_-]+)"/gu)].map(match => match[1] ?? '')
}

/**
 * Every backend module that depends on `module`, directly or not (the shared modules are not followed: they import everything).
 * @param {string} module the changed module, such as `locallogs`
 * @param {Record<string, string[]>} imports file name (without `.pi`) to the modules it imports
 * @param {Set<string>} shared names of the shared modules
 * @returns {Set<string>} the module itself and its dependents
 */
export function dependents(module, imports, shared) {
  const seen = new Set([module])
  const queue = [module]
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    for (const [file, used] of Object.entries(imports)) {
      if (!seen.has(file) && !shared.has(file) && used.includes(name)) {
        seen.add(file)
        queue.push(file)
      }
    }
  }
  return seen
}

/**
 * The backend test files a changed `.pi` file needs: the tests of the module and of what depends on it.
 * @param {string} file a changed path under apps/backend
 * @param {{ tests: string[], imports: Record<string, string[]> }} backend the test files and what each file imports
 * @returns {string[] | null} test file names, or null when it cannot be placed (all of them run)
 */
export function backendTestsFor(file, backend) {
  const name = file.slice(BACKEND_DIR.length).replace(/\.pi$/u, '')
  if (name.endsWith('.test')) return [`${name}.pi`]
  const shared = new Set(['app', 'main', 'session', 'testing', 'test-frontend', 'guarded'])
  const related = dependents(name, backend.imports, shared)
  const wanted = backend.tests.filter(test => related.has(test.replace(/\.test\.pi$/u, '')) ||
    (backend.imports[test.replace(/\.pi$/u, '')] ?? []).some(used => related.has(used)))
  return wanted.length > 0 ? wanted : null
}

/**
 * The specs a changed source file maps to: the map's entries, else the specs that share its name.
 * @param {string} file a changed source path
 * @param {{ entries: { when: string[], specs: string[] }[] }} map .github/e2e-map.json
 * @param {string[]} specs every spec's file name
 * @returns {string[] | null} spec file names, or null when it cannot be placed
 */
export function specsFor(file, map, specs) {
  const globs = map.entries.filter(entry => matchesAny(file, entry.when)).flatMap(entry => entry.specs)
  if (globs.length > 0) return specs.filter(spec => matchesAny(spec, globs))
  const stem = (file.split('/').pop() ?? '').replace(/\.[^.]+$/u, '').replace(/^use(?=[A-Z])/u, '').toLowerCase()
  const named = stem.length < 4 ? [] : specs.filter(spec => spec.toLowerCase().includes(stem))
  return named.length > 0 ? named : null
}

/**
 * Everything selected, as a decision with its reasons.
 * @param {object} input the change and the tree
 * @param {string[]} input.files changed paths (relative to the root); empty means the diff is unknown
 * @param {string[]} input.specs spec file names in apps/frontend/e2e
 * @param {{ tests: string[], imports: Record<string, string[]> }} input.backend backend test files and imports
 * @param {{ smoke: string[], smokeSitl: string, entries: { when: string[], specs: string[] }[] }} input.map the e2e map
 * @param {boolean} [input.full] force everything (main, the label, a manual run)
 * @returns {{ full: boolean, backend: string[] | 'all', e2e: string[] | 'all', sitl: boolean, reasons: string[] }} the selection
 */
export function select({ files, specs, backend, map, full = false }) {
  const reasons = []
  const everything = reason => ({ full: true, backend: 'all', e2e: 'all', sitl: true, reasons: [reason, ...reasons] })
  if (full) return everything('a full run was asked for (main, the full-ci label or a manual run)')
  if (files.length === 0) return everything('the changed files are unknown')
  const backendTests = new Set()
  const e2e = new Set()
  let touchesBackend = false
  for (const file of files) {
    if (matchesAny(file, FULL)) return everything(`${file} is shared infrastructure`)
    if (matchesAny(file, UNIT_ONLY)) continue
    const spec = SPEC.exec(file)?.[1]
    if (spec !== undefined) {
      if (specs.includes(spec)) e2e.add(spec)
      continue
    }
    if (!SOURCE.test(file)) return everything(`${file} is not a place the selector knows`)
    const isBackend = file.startsWith(BACKEND_DIR)
    touchesBackend ||= isBackend
    const tests = isBackend ? backendTestsFor(file, backend) : []
    if (tests === null) return everything(`${file} has no test that covers it`)
    tests.forEach(test => backendTests.add(test))
    if (file.endsWith('.test.pi')) continue
    const mapped = specsFor(file, map, specs)
    if (mapped === null) return everything(`${file} is in no entry of e2e-map.json`)
    mapped.forEach(name => e2e.add(name))
  }
  // The smoke set runs whenever something that is not only a document or a unit test changed.
  if (files.some(file => !matchesAny(file, UNIT_ONLY))) map.smoke.forEach(name => e2e.add(name))
  if (touchesBackend) e2e.add(map.smokeSitl)
  const sitl = [...e2e].some(name => SITL.test(name))
  return { full: false, backend: [...backendTests].sort(), e2e: [...e2e].sort(), sitl, reasons }
}

/**
 * The summary for the job page.
 * @param {ReturnType<typeof select>} result the selection
 * @param {{ specs: number, tests: number, files: number, shadow: boolean }} totals what exists
 * @returns {string} Markdown
 */
export function summaryOf(result, totals) {
  const count = (chosen, all) => chosen === 'all' ? `all ${all}` : `${chosen.length} of ${all}`
  const lines = [
    `### Test selection${totals.shadow ? ' (shadow mode: everything still runs)' : ''}`,
    '',
    result.full
      ? `**Everything** would run, because ${result.reasons[0]}.`
      : `Would run ${count(result.e2e, totals.specs)} e2e specs and ${count(result.backend, totals.tests)} backend test files` +
        ` (${totals.files} files changed); SITL: ${result.sitl ? 'yes' : 'no'}; the unit tests and lint always run.`,
  ]
  if (!result.full) {
    lines.push('', `e2e: ${result.e2e.join(', ') || '(none)'}`, '', `backend: ${result.backend.join(', ') || '(none)'}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * What the working tree offers the selector.
 * @param {string} root the repository root
 * @returns {{ specs: string[], backend: { tests: string[], imports: Record<string, string[]> }, map: object }} the tree
 */
export function readTree(root) {
  const specs = readdirSync(join(root, E2E_DIR)).filter(name => name.endsWith('.e2e.ts')).sort()
  const sources = readdirSync(join(root, BACKEND_DIR)).filter(name => name.endsWith('.pi')).sort()
  const imports = Object.fromEntries(sources.map(name => [name.replace(/\.pi$/u, ''), importsOf(readFileSync(join(root, BACKEND_DIR, name), 'utf8'))]))
  const map = JSON.parse(readFileSync(join(root, '.github/e2e-map.json'), 'utf8'))
  return { specs, backend: { tests: sources.filter(name => name.endsWith('.test.pi')), imports }, map }
}

/**
 * Runs the selector for the command line: names on stdin, outputs to $GITHUB_OUTPUT, summary to $GITHUB_STEP_SUMMARY.
 * @param {string[]} argv `--root DIR [--full] [--shadow]`
 * @param {string} input the changed file names, one per line
 * @returns {string} the summary
 */
export function run(argv, input) {
  const root = argv[argv.indexOf('--root') + 1] ?? '.'
  const tree = readTree(root)
  const files = input.split('\n').map(line => line.trim()).filter(line => line !== '')
  let result
  try {
    result = select({ ...tree, files, full: argv.includes('--full') })
  } catch (error) {
    result = { full: true, backend: 'all', e2e: 'all', sitl: true, reasons: [`the selector failed (${error})`] }
  }
  const text = summaryOf(result, { specs: tree.specs.length, tests: tree.backend.tests.length, files: files.length, shadow: argv.includes('--shadow') })
  const outputs = { full: result.full, sitl: result.sitl, backend: result.backend === 'all' ? '.' : result.backend.join(' '), e2e: result.e2e === 'all' ? '' : result.e2e.join(' ') }
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`).join('\n')
  if (process.env.GITHUB_OUTPUT !== undefined) appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`)
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text)
  return `${text}\n${lines}\n`
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(run(process.argv.slice(2), readFileSync(0, 'utf8')))
}
