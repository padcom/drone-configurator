// @vitest-environment node
// The split of test files into CI shards by their measured times (.github/shard.mjs): balanced, deterministic, every file in
// exactly one shard, a PR's selection kept, and the real tree's shards close to one another.
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shardOf, split } from '../../../.github/shard.mjs'

const root = resolve(process.cwd(), '../..')
const TIMES = { a: 100, b: 60, c: 50, d: 40, e: 10 }

describe('the split', () => {
  it('puts each file, the longest first, in the shard with the least so far', () => {
    expect(split(['a', 'b', 'c', 'd', 'e'], TIMES, 30, 2)).toEqual([['a', 'd'], ['b', 'c', 'e']])
  })

  it('counts a file it has no time for as the fallback, and leaves extra shards empty', () => {
    expect(split(['new', 'e'], TIMES, 30, 3)).toEqual([['new'], ['e'], []])
  })

  it('has every file in exactly one shard, whatever the order it is given in', () => {
    const files = ['e', 'c', 'a', 'd', 'b', 'a']
    const shards = split(files, TIMES, 30, 3)

    expect(shards.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(split([...files].reverse(), TIMES, 30, 3)).toEqual(shards)
  })
})

describe('the shards of the tree', () => {
  const text = readFileSync(resolve(root, '.github/test-times.json'), 'utf8')
  const times = JSON.parse(text) as Record<string, Record<string, number>>

  const kinds = [['backend', 3], ['e2e', 2], ['sitl', 3], ['weekly', 3]] as const

  it.each(kinds)('of %s (%d) hold every file once, and end close together', (kind, of) => {
    const shards = Array.from({ length: of }, (_unused, n) => shardOf({ root, kind, shard: n + 1, of }))
    const names = shards.flat().map(file => file.replace(/^e2e\//u, ''))
    const total = (list: string[]) => list.reduce((sum, file) => sum + (times[kind]?.[file.replace(/^e2e\//u, '')] ?? 30), 0)
    const totals = shards.map(total)

    expect(new Set(names).size).toBe(names.length)
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThan(Math.max(...Object.values(times[kind] ?? {})) + 1)
  })

  it('keeps only what a PR selected, and every file for `all`', () => {
    const only = shardOf({ root, kind: 'backend', shard: 1, of: 1, only: 'params.test.pi arming.test.pi' })

    expect(only).toEqual(['arming.test.pi', 'params.test.pi'])
    expect(shardOf({ root, kind: 'backend', shard: 1, of: 1, only: 'all' }).length).toBeGreaterThan(30)
  })
})
