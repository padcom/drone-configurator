import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_KEY, i18n, isLanguage, legacyLanguage, setLanguage, storageOf } from './i18n'

/**
 * A storage in memory.
 *
 * @param initial what it holds at first
 * @returns the storage
 */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => void data.delete(key),
    data,
  }
}

const broken = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('QuotaExceededError')
  },
}

/** A scope whose `localStorage` property throws, as in some browsers with storage blocked. */
const forbidden = {
  get localStorage(): Storage {
    throw new Error('SecurityError')
  },
}

describe('the messages', () => {
  it('are in English, and a missing key shows the key, not a blank', () => {
    expect(i18n.global.t('app.title')).toBe('Drone Configurator')
    expect(i18n.global.t('language.label')).toBe('Language')
    expect(i18n.global.t('no.such.key')).toBe('no.such.key')
  })

  it('have one entry per language the interface offers', () => {
    for (const language of LANGUAGES) {
      expect(i18n.global.t(`language.${language}`)).not.toBe(`language.${language}`)
    }
  })
})

describe('the language', () => {
  it('is English until the settings say another, and is switched without touching the storage', () => {
    expect(i18n.global.locale.value).toBe(DEFAULT_LANGUAGE)
    setLanguage('en')
    expect(i18n.global.locale.value).toBe('en')
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage(undefined)).toBe(false)
  })
})

describe('the language an earlier version kept in the browser', () => {
  it('is read when it names a language the interface has, and not otherwise, whatever the storage holds', () => {
    const kept = (stored?: string) => legacyLanguage(memoryStorage(stored ? { [LANGUAGE_KEY]: stored } : {}))?.read()

    expect(kept('en')).toBe('en')
    expect([kept(), kept('<script>'), kept('xx')]).toEqual([null, null, null])
  })

  it('is forgotten once moved into the settings', () => {
    const storage = memoryStorage({ [LANGUAGE_KEY]: 'en' })

    legacyLanguage(storage)?.forget()

    expect(storage.data.has(LANGUAGE_KEY)).toBe(false)
  })

  it('does not break the interface when storage is missing, full or forbidden', () => {
    const reading = legacyLanguage(broken)

    expect(legacyLanguage(null)).toBeNull()
    expect(reading?.read()).toBeNull()
    expect(() => reading?.forget()).not.toThrow()
    expect(storageOf({})).toBeNull()
    expect(storageOf(forbidden)).toBeNull()
  })
})
