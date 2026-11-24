// Only English is loaded at the start: another language is loaded when it is chosen, English is shown meanwhile, and of two
// languages asked for one after the other the later is shown. (The test setup loads every language for the other tests: this
// one takes a fresh copy of the module.)
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
})

/**
 * A fresh copy of the i18n module, with only English loaded.
 *
 * @returns the module
 */
function fresh() {
  vi.resetModules()

  return import('./i18n')
}

it('starts with English only, and shows another language once it is loaded', async () => {
  const { i18n, setLanguage } = await fresh()

  expect(i18n.global.availableLocales).toEqual(['en'])
  const shown = setLanguage('de')
  expect(i18n.global.locale.value).toBe('en')
  await shown

  expect(i18n.global.locale.value).toBe('de')
  expect(i18n.global.t('settings.dismiss')).not.toBe('Dismiss')
})

it('shows the language asked for last when two are loading', async () => {
  const { i18n, setLanguage } = await fresh()
  const first = setLanguage('pl')
  const second = setLanguage('uk')
  await Promise.all([first, second])

  expect(i18n.global.locale.value).toBe('uk')
})

it('switches at once to a language that is loaded', async () => {
  const { i18n, loadLanguage, setLanguage } = await fresh()
  await loadLanguage('it')
  void setLanguage('it')

  expect(i18n.global.locale.value).toBe('it')
})
