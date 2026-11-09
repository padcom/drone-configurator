// Internationalization: the messages are in src/locales, precompiled to functions at build time by
// @intlify/unplugin-vue-i18n (see vite.config.ts), so the runtime has no message compiler and needs no `eval` or
// `new Function`, which the production CSP forbids.
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'

/** The languages the interface has messages for. */
export const LANGUAGES = ['en'] as const

/** One of `LANGUAGES`. */
export type Language = typeof LANGUAGES[number]

/** The language used when none was chosen, and for any message another language lacks. */
export const DEFAULT_LANGUAGE: Language = 'en'

/** Where the chosen language was kept before the settings existed (#19): read once, to move it into the settings. */
export const LANGUAGE_KEY = 'drone-configurator:language:v1'

/**
 * Whether a value names a language the interface has.
 *
 * @param value anything, such as text read from storage
 * @returns true for one of `LANGUAGES`
 */
export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

/** Something that has a `localStorage`: `window`, in the browser. */
export interface StorageScope {
  /** The browser's storage, which may be absent. */
  localStorage?: Storage
}

/**
 * The storage, or null if even asking for it is an error (some browsers throw on the property).
 *
 * @param scope `window`, or anything with a `localStorage`
 * @returns the storage, or null
 */
export function storageOf(scope: StorageScope): Storage | null {
  try {
    return scope.localStorage ?? null
  } catch {
    return null
  }
}

/** The language an earlier version of the interface kept in the browser's storage. */
export interface LegacyLanguage {
  /** The language that was kept, or null if none was, or it is not one the interface has. */
  read: () => Language | null
  /** Removes it, once it has been moved into the settings. */
  forget: () => void
}

/**
 * The language the user chose before the settings existed. Storage may be missing, full or forbidden, and its content is
 * not trusted.
 *
 * @param storage localStorage, or null
 * @returns how to read and forget it, or null when there is no storage
 */
export function legacyLanguage(storage: Pick<Storage, 'getItem' | 'removeItem'> | null): LegacyLanguage | null {
  if (storage === null) {
    return null
  }

  return {
    read() {
      try {
        const stored = storage.getItem(LANGUAGE_KEY)

        return isLanguage(stored) ? stored : null
      } catch {
        return null
      }
    },
    forget() {
      try {
        storage.removeItem(LANGUAGE_KEY)
      } catch {
        // Storage that cannot be written to keeps it; it is read again, and moved again, next time.
      }
    },
  }
}

/** The interface's i18n instance: Composition API only, English as the fallback of every language. */
export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LANGUAGE,
  fallbackLocale: DEFAULT_LANGUAGE,
  messages: { en },
})

/**
 * Switches the interface language. (Keeping the choice is the settings' business: useSettings.)
 *
 * @param language one of `LANGUAGES`
 */
export function setLanguage(language: Language): void {
  i18n.global.locale.value = language
}
