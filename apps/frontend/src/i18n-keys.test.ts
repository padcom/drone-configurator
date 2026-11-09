// @vitest-environment node
// Every message key the code asks for exists in src/locales/en.json. The ESLint rule no-missing-keys checks the
// components; this test also covers the plain .ts functions that take a `translate` function, and a dynamic key
// (`connection.state.${state}`) is checked by its prefix.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('.', import.meta.url))

/** A call of `t(`, `translate(` or `$t(` with a literal as the key: the quote and the key. */
const CALL = /(?:\$t|\bt|\btranslate)\(\s*(?<quote>['"`])(?<key>[^'"`]+)\k<quote>/gu

/**
 * Whether a directory is not searched: generated code and the messages themselves.
 *
 * @param name the directory's name
 * @returns true to skip it
 */
const isSkipped = (name: string) => name === 'generated' || name === 'locales'

/**
 * Whether a file asks for messages: a component or a module, not a test.
 *
 * @param name the file's name
 * @returns true for a .vue file, or a .ts file that is not a test
 */
const isSource = (name: string) => /\.(?:vue|ts)$/u.test(name) && !/\.test\.ts$/u.test(name)

/**
 * The files of src that ask for messages.
 *
 * @param directory the directory to read
 * @returns the paths
 */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return isSkipped(entry.name) ? [] : sources(path)
    }

    return isSource(entry.name) ? [path] : []
  })
}

/**
 * The messages of a (nested) message object, by their dotted path.
 *
 * @param value the messages
 * @param prefix the path of `value`
 * @returns each message's path and text
 */
function entries(value: unknown, prefix = ''): [string, unknown][] {
  if (typeof value !== 'object' || value === null) {
    return [[prefix, value]]
  }

  return Object.entries(value).flatMap(([name, child]) => entries(child, prefix ? `${prefix}.${name}` : name))
}

const messages = new Map(entries(JSON.parse(readFileSync(join(SRC, 'locales', 'en.json'), 'utf8'))))

/**
 * The keys a file asks for.
 *
 * @param file the path of the file
 * @returns each key as written, with the file's name
 */
function keysIn(file: string): { key: string, file: string }[] {
  const text = readFileSync(file, 'utf8')

  return [...text.matchAll(CALL)].map(match => ({ key: match.groups?.key ?? '', file: relative(SRC, file) }))
}

const asked = sources(SRC).flatMap(keysIn)

describe('the message keys', () => {
  it('are asked for somewhere (the scan finds the calls)', () => {
    expect(asked.length).toBeGreaterThan(20)
  })

  it('all exist in en.json', () => {
    const missing = asked.filter(({ key }) => !key.includes('${') && !messages.has(key))

    expect(missing).toEqual([])
  })

  it('that are built from a state have messages under their prefix', () => {
    const prefixes = asked.filter(({ key }) => key.includes('${')).map(({ key }) => key.slice(0, key.indexOf('${')))

    expect(prefixes.length).toBeGreaterThan(0)

    for (const prefix of prefixes) {
      expect([...messages.keys()].filter(path => path.startsWith(prefix)).length).toBeGreaterThan(0)
    }
  })

  it('are never an empty message', () => {
    const empty = [...messages].filter(([, text]) => text === '').map(([path]) => path)

    expect(empty).toEqual([])
  })
})
