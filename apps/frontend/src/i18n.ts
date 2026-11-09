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

/** Where the chosen language is kept (the key is versioned like the other stored data). */
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

/**
 * The language the user chose earlier. Storage may be missing, full or forbidden, and its content is not trusted.
 *
 * @param storage localStorage, or null
 * @returns the stored language, else the default
 */
export function readLanguage(storage: Pick<Storage, 'getItem'> | null): Language {
  try {
    const stored = storage?.getItem(LANGUAGE_KEY)

    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

/**
 * Keeps the chosen language.
 *
 * @param storage localStorage, or null
 * @param language what the user chose
 * @returns false if it could not be kept
 */
export function writeLanguage(storage: Pick<Storage, 'setItem'> | null, language: Language): boolean {
  try {
    storage?.setItem(LANGUAGE_KEY, language)

    return storage !== null
  } catch {
    return false
  }
}

/** The interface's i18n instance: Composition API only, English as the fallback of every language. */
export const i18n = createI18n({
  legacy: false,
  locale: readLanguage(storageOf(globalThis)),
  fallbackLocale: DEFAULT_LANGUAGE,
  messages: { en },
})

/**
 * Switches the interface language and keeps the choice.
 *
 * @param language one of `LANGUAGES`
 */
export function setLanguage(language: Language): void {
  i18n.global.locale.value = language
  writeLanguage(storageOf(globalThis), language)
}
