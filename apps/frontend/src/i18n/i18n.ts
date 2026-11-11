// Internationalization: the messages are in src/i18n/locales, precompiled to functions at build time by
// @intlify/unplugin-vue-i18n (see vite.config.ts), so the runtime has no message compiler and needs no `eval` or
// `new Function`, which the production CSP forbids.
import { createI18n } from 'vue-i18n'
import de from '@/i18n/locales/de.json'
import en from '@/i18n/locales/en.json'
import es from '@/i18n/locales/es.json'
import it from '@/i18n/locales/it.json'
import pl from '@/i18n/locales/pl.json'
import ru from '@/i18n/locales/ru.json'
import uk from '@/i18n/locales/uk.json'

/**
 * The languages of the interface: ONE table. A new language is a locale file in `locales/`, a row here (its code, its name in
 * its own language, and its messages), and a look at the fonts (`assets/styles/fonts.css`: Latin, Latin Extended, Cyrillic).
 * The plural rules are `Intl.PluralRules` of the code (see `pluralIndex`); every locale file is checked against `en.json`.
 */
const TABLE = {
  en: { name: 'English', messages: en },
  de: { name: 'Deutsch', messages: de },
  pl: { name: 'Polski', messages: pl },
  it: { name: 'Italiano', messages: it },
  es: { name: 'Español', messages: es },
  uk: { name: 'Українська', messages: uk },
  ru: { name: 'Русский', messages: ru },
}

/** One of the languages in the table. */
export type Language = keyof typeof TABLE

/** The languages the interface has messages for, English first. */
export const LANGUAGES = Object.keys(TABLE) as Language[]

/** What each language calls itself: the names in the Settings select, which do not change with the language chosen. */
export const LANGUAGE_NAMES = Object.fromEntries(LANGUAGES.map(code => [code, TABLE[code].name])) as Record<Language, string>

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

const pluralRules = new Map<string, Intl.PluralRules>()

/**
 * The plural rules of a language, made once.
 *
 * @param language the language
 * @returns its `Intl.PluralRules`
 */
function ruleFor(language: string): Intl.PluralRules {
  const rule = pluralRules.get(language) ?? new Intl.PluralRules(language)
  pluralRules.set(language, rule)

  return rule
}

/**
 * Which form of a message with plural forms (`one | other`, or `one | few | many`) a count takes. The categories are the
 * language's own (`Intl.PluralRules`): with two forms the first is "one" and the second everything else (English, German,
 * Italian, Spanish); with three, "one", then "few", then everything else (Polish, Ukrainian, Russian: "many").
 *
 * @param language the language
 * @param count the number the message is about
 * @param forms how many forms the message has
 * @returns the index of the form
 */
export function pluralIndex(language: string, count: number, forms: number): number {
  const at = ['one', 'few'].indexOf(ruleFor(language).select(count))
  // "one" is always the first form, "few" the second when there are three; anything else is the last.
  const wanted = forms > 2 || at === 0 ? at : -1

  return wanted < 0 ? Math.max(forms - 1, 0) : wanted
}

/** The interface's i18n instance: Composition API only, English as the fallback of every language. */
export const i18n = createI18n({
  legacy: false,
  locale: DEFAULT_LANGUAGE,
  fallbackLocale: DEFAULT_LANGUAGE,
  messages: Object.fromEntries(LANGUAGES.map(code => [code, TABLE[code].messages])),
  pluralRules: Object.fromEntries(LANGUAGES.map(code => [code, (n: number, forms: number) => pluralIndex(code, n, forms)])),
})

/** Where the language last shown is kept in the browser, only to start in it: the settings stay the one place it is chosen. */
export const LANGUAGE_HINT_KEY = 'drone-configurator:language-hint:v1'

/**
 * Keeps the language that is shown, so that the next start can show it before the settings (which come from the backend, a
 * moment after the page) have been read: without it the page would start in English and change.
 *
 * @param storage localStorage, or null
 * @param language the language that is shown
 */
export function rememberLanguage(storage: Pick<Storage, 'setItem'> | null, language: Language): void {
  try {
    storage?.setItem(LANGUAGE_HINT_KEY, language)
  } catch {
    // Storage that cannot be written to is only a lost hint.
  }
}

/**
 * Switches the interface language, and the `lang` of the page (for the browser's hyphenation, quotes and screen readers).
 * (Keeping the choice is the settings' business: useSettings.)
 *
 * @param language one of `LANGUAGES`
 */
export function setLanguage(language: Language): void {
  i18n.global.locale.value = language

  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
  }
  rememberLanguage(typeof window === 'undefined' ? null : storageOf(window), language)
}

/**
 * Starts in the language that was shown last, if it is known (it is not trusted: it has to be one of the languages). The
 * settings, once read, decide, and change it if they name another.
 *
 * @param storage localStorage, or null
 */
export function startInRememberedLanguage(storage: Pick<Storage, 'getItem'> | null): void {
  try {
    const hint = storage?.getItem(LANGUAGE_HINT_KEY)
    if (isLanguage(hint)) {
      setLanguage(hint)
    }
  } catch {
    // Storage that cannot be read gives no hint: the page starts in English.
  }
}
