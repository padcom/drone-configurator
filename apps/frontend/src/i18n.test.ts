import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_KEY, i18n, isLanguage, readLanguage, storageOf, writeLanguage } from './i18n'

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
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

const broken = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
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

describe('the chosen language', () => {
  it('is English until another one is chosen, whatever the storage holds', () => {
    expect(readLanguage(null)).toBe(DEFAULT_LANGUAGE)
    expect(readLanguage(memoryStorage())).toBe(DEFAULT_LANGUAGE)
    expect(readLanguage(memoryStorage({ [LANGUAGE_KEY]: '<script>' }))).toBe(DEFAULT_LANGUAGE)
    expect(readLanguage(memoryStorage({ [LANGUAGE_KEY]: 'xx' }))).toBe(DEFAULT_LANGUAGE)
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage(undefined)).toBe(false)
  })

  it('is kept and read back', () => {
    const storage = memoryStorage()

    expect(writeLanguage(storage, 'en')).toBe(true)
    expect(storage.data.get(LANGUAGE_KEY)).toBe('en')
    expect(readLanguage(storage)).toBe('en')
  })

  it('does not break the interface when storage is missing, full or forbidden', () => {
    expect(writeLanguage(null, 'en')).toBe(false)
    expect(writeLanguage(broken, 'en')).toBe(false)
    expect(readLanguage(broken)).toBe(DEFAULT_LANGUAGE)
    expect(storageOf({})).toBeNull()
    expect(storageOf(forbidden)).toBeNull()
  })
})
