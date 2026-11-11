// @vitest-environment node
// The lint of the templates (no-raw-text) cannot see the words that code makes: the question of a write, the reason a file was
// refused, a notice of a failed setting. Those come from `say()` (src/i18n/say.ts) and the locale files, so that every
// language has them. This test finds a string literal in the plain modules (composables, lib, state, backend) that is a sentence
// of English (two or more words), which is what a message that bypassed the locale files looks like. A literal that is not for
// the user (a key, a code, a developer's error) is named in ALLOWED, with the reason.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('..', import.meta.url))
const FOLDERS = ['composables', 'lib', 'state', 'backend']

/** Literals that are not for the user: the file (under src) and a part of the literal. */
const ALLOWED: [string, string][] = [
  ['composables/useConfigurator.ts', 'has not been called'],
]

/**
 * The files of a folder, deep, that are code and not tests.
 *
 * @param directory the folder
 * @returns their paths
 */
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return files(path)
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

/**
 * The code of a module without its comments.
 *
 * @param text the module
 * @returns the text with the comments blanked
 */
const withoutComments = (text: string): string => text.replaceAll(/\/\*[^]*?\*\//gu, '').replaceAll(/^\s*\/\/.*$/gmu, '')

/**
 * The string literals of a module that read like English: two words of letters, one after the other.
 *
 * @param text the module, without comments
 * @returns the literals
 */
function sentences(text: string): string[] {
  const literals = text.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gu) ?? []

  return literals
    .map(literal => literal.slice(1, -1).replaceAll(/\$\{[^}]*\}/gu, ' '))
    .filter(literal => /(?:^|[^\w])[A-Za-z']{3,} [A-Za-z']{2,}(?:[^\w]|$)/u.test(literal))
    // A regular expression or a path is not a sentence.
    .filter(literal => !/[\\^$[\]|]|\.\w+$|^[./@]/u.test(literal))
}

/**
 * The sentences of English in the modules of a folder, that are not allowed.
 *
 * @param folder the folder under src
 * @returns `file: literal` for each
 */
function foundIn(folder: string): string[] {
  const allowed = (name: string, literal: string) => ALLOWED.some(([where, part]) => where === name && literal.includes(part))

  return files(join(SRC, folder)).flatMap(file => {
    const name = relative(SRC, file)

    const found = sentences(withoutComments(readFileSync(file, 'utf8')))

    return found.filter(literal => !allowed(name, literal)).map(literal => `${name}: ${literal}`)
  })
}

describe.each(FOLDERS)('the plain modules of %s', folder => {
  it('have no sentence of English in a string literal: what a person reads comes from say() and the locale files', () => {
    expect(foundIn(folder)).toEqual([])
  })
})
