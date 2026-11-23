// Splits test files into CI shards by how long they take (.github/test-times.json, measured on the slower runner): each file, the
// longest first, goes to the shard with the least time so far, so the shards end together and the slowest one is as short as it
// can be. Deterministic (ties by name), and every file is in exactly one shard. Plain Node, no dependencies; unit-tested in
// apps/frontend/e2e/shard.test.ts.
//
// Usage: node .github/shard.mjs --kind backend|e2e|sitl --shard N --of M [--only "a b c"] [--root DIR]
//   prints the files of shard N (1-based), one per line: backend tests as `pico test` takes them (`params.test.pi`), specs as
//   `pnpm e2e` takes them (`e2e/shell.e2e.ts`). `--only` keeps those of the files that are named (the PR's selection; `all`, or
//   no `--only`, keeps every one). A shard may be empty.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listSpecs } from './ci-select.mjs'

/**
 * Splits files into shards by their times.
 *
 * @param {string[]} files the files
 * @param {Record<string, number>} times seconds by file
 * @param {number} fallback the seconds of a file that has none
 * @param {number} count how many shards
 * @returns {string[][]} the files of each shard, sorted by name
 */
export function split(files, times, fallback, count) {
  const shards = Array.from({ length: count }, () => ({ total: 0, files: [] }))
  const timeOf = file => times[file] ?? fallback
  const ordered = [...new Set(files)].sort((a, b) => timeOf(b) - timeOf(a) || a.localeCompare(b))
  for (const file of ordered) {
    const least = shards.reduce((best, shard) => (shard.total < best.total ? shard : best))
    least.total += timeOf(file)
    least.files.push(file)
  }
  return shards.map(shard => shard.files.sort())
}

/**
 * The files of a kind in the tree.
 *
 * @param {string} root the repository root
 * @param {'backend' | 'e2e' | 'sitl'} kind which
 * @returns {string[]} names as the times file has them (`params.test.pi`, `shell.e2e.ts`)
 */
function filesOf(root, kind) {
  if (kind === 'backend') {
    return readdirSync(join(root, 'apps/backend')).filter(name => name.endsWith('.test.pi'))
  }
  return listSpecs(root, kind === 'sitl' ? 'sitl' : 'fake').map(path => path.replace(/^e2e\//u, ''))
}

/**
 * The files of one shard.
 *
 * @param {{ root: string, kind: 'backend' | 'e2e' | 'sitl', shard: number, of: number, only?: string }} options what to split
 * @returns {string[]} the shard's files, as the runner takes them
 */
export function shardOf({ root, kind, shard, of, only }) {
  const times = JSON.parse(readFileSync(join(root, '.github/test-times.json'), 'utf8'))
  const named = only === undefined || only.trim() === 'all' ? null : new Set(only.split(/\s+/u).filter(Boolean))
  // (the selection names specs and backend tests by their bare names: `shell.e2e.ts`, `params.test.pi`)
  const files = filesOf(root, kind).filter(file => named === null || named.has(file))
  const chosen = split(files, times[kind] ?? {}, times.default?.[kind] ?? 30, of)[shard - 1] ?? []
  return kind === 'backend' ? chosen : chosen.map(file => `e2e/${file}`)
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const value = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const kind = value('--kind')
  if (kind !== 'backend' && kind !== 'e2e' && kind !== 'sitl') throw new Error('--kind takes backend, e2e or sitl')
  const files = shardOf({ root: value('--root') ?? '.', kind, shard: Number(value('--shard')), of: Number(value('--of')), only: value('--only') })
  process.stdout.write(files.length > 0 ? `${files.join('\n')}\n` : '')
}
