// The words of the interface for code that is not a component: the lines of a question, the reason a file was refused, the notice
// of a failed setting. A component asks `t()` (useI18n); plain modules ask `say()`, which takes the language that is on the page
// at the moment, so the text follows a language switch. The messages are in `locales/*.json`, and the parity test and the test
// that looks for English literals in the code (tests/i18n-literals.test.ts) are what keep them there.
import { DEFAULT_LANGUAGE, i18n } from './i18n'

/**
 * A message of the interface, in the language of the page.
 *
 * @param key the message's key
 * @param named the values in it ({count}, {id} ...)
 * @param plural the number that picks the plural form of a message that has them (`a | b`), if it has them
 * @returns the text
 */
export function say(key: string, named: Record<string, unknown> = {}, plural?: number): string {
  return plural === undefined ? i18n.global.t(key, named) : i18n.global.t(key, named, plural)
}

/**
 * The language of the page (the interface's, not the browser's): what text is sorted and compared by.
 *
 * @returns its code
 */
export function pageLanguage(): string {
  return String(i18n.global.locale.value)
}

/**
 * A message of the interface in English, whatever the language of the page is: for what is searched by its English name as
 * well as its translated one (the command palette).
 *
 * @param key the message's key
 * @param named the values in it
 * @returns the English text
 */
export function sayEnglish(key: string, named: Record<string, unknown> = {}): string {
  return i18n.global.t(key, named, { locale: DEFAULT_LANGUAGE })
}
