// @vitest-environment node
// kit.css is made of the tokens and nothing else: no colour written out, and every token it uses exists in tokens.css
// (a misspelt `var(--color-acent)` would silently draw nothing).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

/**
 * A file of this folder, without its comments.
 *
 * @param name the file's name
 * @returns its text
 */
function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8').replaceAll(/\/\*[^]*?\*\//gu, '')
}

const kit = read('kit.css')
const defined = new Set([...read('tokens.css').matchAll(/(?<name>--[\w-]+)\s*:/gu)].map(match => match.groups?.name))

it('writes no colour out in the controls\' styles', () => {
  expect(kit.match(/#[\da-f]{3,8}\b/giu)).toBeNull()
  expect(kit.match(/\b(?:rgb|hsl)a?\(/giu)).toBeNull()
})

it('uses only tokens that tokens.css defines', () => {
  const used = [...kit.matchAll(/var\((?<name>--[\w-]+)/gu)].map(match => match.groups?.name)

  expect(used.length).toBeGreaterThan(20)
  expect(used.filter(name => !defined.has(name))).toEqual([])
})
