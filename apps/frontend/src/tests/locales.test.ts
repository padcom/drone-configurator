// @vitest-environment node
// Every language of the interface (src/i18n/locales/*.json) says the same as English: the same messages, the same {placeholders},
// nothing empty, and the plural forms its language has (two, or three where the language has "few"). A new language is one file
// in the folder and one row in the table of i18n.ts, and this test is what tells it is complete.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, LANGUAGE_NAMES } from '@/i18n/i18n'

const DIR = fileURLToPath(new URL('../i18n/locales', import.meta.url))
const FILES = readdirSync(DIR).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/u, '')).sort()

/** The messages of a locale file, flat: dotted key → text. */
type Flat = Map<string, string>

/**
 * A locale file as dotted keys and texts.
 *
 * @param code the language
 * @returns the messages
 */
function load(code: string): Flat {
  const flat: Flat = new Map()
  const walk = (node: unknown, prefix: string): void => {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === 'string') {
        flat.set(`${prefix}${key}`, value)
      } else {
        walk(value, `${prefix}${key}.`)
      }
    }
  }
  walk(JSON.parse(readFileSync(join(DIR, `${code}.json`), 'utf8')), '')

  return flat
}

/**
 * The forms of a message (`a | b | c`).
 *
 * @param text the message
 * @returns the forms, trimmed
 */
const formsOf = (text: string): string[] => text.split(' | ').map(form => form.trim())

/**
 * The placeholders of a message form.
 *
 * @param text the form
 * @returns their names, sorted, once each
 */
const placeholdersOf = (text: string): string[] => {
  const names = [...text.matchAll(/\{(?<name>\w+)\}/gu)].map(match => match.groups?.name ?? '')

  return [...new Set(names)].sort()
}

/**
 * How many plural forms a language writes: "one" and the rest (2), or "one", "few" and the rest (3).
 *
 * @param code the language
 * @returns 2 or 3
 */
function pluralFormsOf(code: string): number {
  const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories

  return categories.includes('few') ? 3 : 2
}

const english = load('en')

/**
 * The messages whose forms do not have the placeholders English has.
 *
 * @param messages a language's messages
 * @returns their keys
 */
function wrongPlaceholders(messages: Flat): string[] {
  const differs = (form: string, text: string) => placeholdersOf(form).join() !== placeholdersOf(text).join()

  return [...english]
    .filter(([key, text]) => formsOf(messages.get(key) ?? '').some(form => differs(form, text)))
    .map(([key]) => key)
}

/**
 * The messages that do not have the number of forms the language needs (its plural forms where English has two, else one).
 *
 * @param messages a language's messages
 * @param code the language
 * @returns what is wrong, by key
 */
function wrongForms(messages: Flat, code: string): string[] {
  // Where English has plural forms a language has its own number of them, or one form that reads right for every count
  // (a "label: {count}" does, and the Slavic languages use it where a count with an ending of its own would be wrong).
  const allowed = (text: string) => formsOf(text).length > 1 ? [pluralFormsOf(code), 1] : [1]
  const forms = (key: string) => formsOf(messages.get(key) ?? '').length

  return [...english]
    .filter(([key, text]) => !allowed(text).includes(forms(key)))
    .map(([key, text]) => `${key}: ${forms(key)} forms, ${allowed(text).join(' or ')} wanted`)
}

it('has a locale file for every language of the table, and a row of the table for every locale file', () => {
  expect([...LANGUAGES].sort()).toEqual(FILES)
  expect(Object.keys(LANGUAGE_NAMES).sort()).toEqual(FILES)
  expect(LANGUAGES[0]).toBe('en')
})

it('names each language in itself, once each, and not empty', () => {
  const names = Object.values(LANGUAGE_NAMES)

  expect(names.every(name => name.trim() !== '')).toBe(true)
  expect(new Set(names).size).toBe(names.length)
})

describe.each(FILES.filter(code => code !== 'en'))('the messages of %s', code => {
  const messages = load(code)

  it('are the same messages as English: no key missing, none that English does not have', () => {
    const missing = [...english.keys()].filter(key => !messages.has(key))
    const extra = [...messages.keys()].filter(key => !english.has(key))

    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
  })

  it('are none empty', () => {
    expect([...messages].filter(([, text]) => text.trim() === '').map(([key]) => key)).toEqual([])
  })

  it('use the same {placeholders} as English in every form', () => {
    expect(wrongPlaceholders(messages)).toEqual([])
  })

  it('have the plural forms of the language where English has them, and one form where it has not', () => {
    expect(wrongForms(messages, code)).toEqual([])
  })
})

it('has plural forms in English that are two (one, other), as the rule for the other languages counts on', () => {
  const plural = [...english].filter(([, text]) => formsOf(text).length > 1)

  expect(plural.length).toBeGreaterThan(0)
  expect(plural.every(([, text]) => formsOf(text).length === 2)).toBe(true)
})
