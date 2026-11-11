// @vitest-environment node
// A message with a count in it must read right for one as well as for five: "All 1 written", "1 rimossi", "Los 1 escritos" do
// not. Every message of every language that has a count in it (a numeric placeholder) is one of:
//   - plural forms (`one | other`, or `one | few | many`): the form that fits the count is picked;
//   - a label and its number, with no word that has to agree with it: "Removed from the favourites: {count}", also a ratio
//     ("{shown} of {total}": the number after a connector that follows another placeholder);
//   - named in FITS, because its words are the same for every count in that language (a person decided, and said why).
// A new message with a count, or a new language, that is none of the three fails here.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIR = fileURLToPath(new URL('../i18n/locales', import.meta.url))
const FILES = readdirSync(DIR).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/u, '')).sort()

/** The placeholders that stand for a number of things. */
const COUNT = /\{(?:count|differ|same|total|shown|missing|matched|described|known)\}/gu

const HAS_COUNT = new RegExp(COUNT.source, 'u')

/**
 * Messages whose words are the same for every count, in every language. Why: no word of the message changes with the number.
 */
const FITS_EVERYWHERE = new Set([
  'toast.count', // "×{count}"
  'params.favourites.clearAsk', // "Remove {count} from your list for every vehicle?": the number is an object of a verb
  'staged.write', // "Write {count} and verify": the same
])

/** Messages that are right for every count in one language only, by `language:key`. */
const FITS_IN = new Set([
  'en:messages.unread', // "{count} new"
  'en:toast.waiting', // "{count} more waiting"
  'en:params.favourites.cleared', // "{count} removed from the favourites"
  'en:import.ready', // "{count} ticked."
  'en:import.write', // "Write {count} ticked"
  'en:staged.partlyWritten', // "{count} written and read back."
  'de:messages.unread', // "{count} neu"
  'de:params.favourites.cleared', // "{count} aus den Favoriten entfernt"
  'de:import.ready', // "{count} angehakt."
  'de:import.write', // "{count} angehakte schreiben"
  'de:staged.partlyWritten', // "{count} geschrieben und zurückgelesen."
  'de:params.status.all', // "{total} Parameter": "Parameter" is the same in the singular and the plural
  'de:params.metadata', // "Metadaten für {count} Parameter": the same
  'de:params.favourites.notOnVehicle', // "{count} deiner Favoriten gibt es an diesem Fahrzeug nicht."
])

/**
 * A locale file as dotted keys and texts.
 *
 * @param code the language
 * @returns the messages
 */
function load(code: string): Map<string, string> {
  const flat = new Map<string, string>()
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
 * Whether the number at a place in a message stands without a word that agrees with it: after a label and a colon (or a
 * semicolon), or as one of the two numbers of a ratio ("{a} of {b}").
 *
 * @param text one form of a message
 * @param at where the placeholder starts
 * @param length how long the placeholder is
 * @returns true when no word has to agree with it
 */
function standsAlone(text: string, at: number, length: number): boolean {
  const before = text.slice(0, at)
  const after = text.slice(at + length)

  return /[:;] $/u.test(before) || /(?:\{\w+\}|\d+) \S{1,4} $/u.test(before) || /^ \S{1,4} \{\w+\}/u.test(after)
}

/**
 * The counts of a message that have a word to agree with.
 *
 * @param text one form of a message
 * @returns the placeholders that are not alone
 */
function agreeing(text: string): string[] {
  return [...text.matchAll(COUNT)]
    .filter(match => !standsAlone(text, match.index, match[0].length))
    .map(match => match[0])
}

/**
 * The messages of a language that have a count in them and are none of the three allowed kinds.
 *
 * @param code the language
 * @returns `key: text`, for each
 */
function unfitting(code: string): string[] {
  return [...load(code)]
    .filter(([, text]) => text.split(' | ').length === 1 && agreeing(text).length > 0)
    .filter(([key]) => !FITS_EVERYWHERE.has(key) && !FITS_IN.has(`${code}:${key}`))
    .map(([key, text]) => `${key}: ${text}`)
}

describe.each(FILES)('the messages of %s with a count in them', code => {
  it('have plural forms, or no word that agrees with the number (or are named as right for every count)', () => {
    expect(unfitting(code).join('\n')).toBe('')
  })
})

describe('the allowed lists', () => {
  it('name only messages that exist, and that do have a count and no plural forms', () => {
    const named = [...FITS_EVERYWHERE].flatMap(key => FILES.map(code => [code, key] as const))
    const own = [...FITS_IN].map(entry => entry.split(':') as [string, string])
    const missing = [...named, ...own].filter(([code, key]) => {
      const text = load(code).get(key)

      return text === undefined || text.split(' | ').length > 1 || !HAS_COUNT.test(text)
    })

    expect(missing).toEqual([])
  })
})
