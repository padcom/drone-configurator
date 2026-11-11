// Which plural form of a message a count takes, in each language (Intl.PluralRules, mapped onto the forms a message has).
import { afterEach, describe, expect, it } from 'vitest'
import { i18n, pluralIndex, setLanguage } from './i18n'

afterEach(() => {
  setLanguage('en')
})

/**
 * The form index for each count.
 *
 * @param language the language
 * @param forms how many forms the message has
 * @param counts the counts
 * @returns the indexes, in the order of the counts
 */
function indexes(language: string, forms: number, counts: number[]): number[] {
  return counts.map(count => pluralIndex(language, count, forms))
}

describe('two forms (one | other)', () => {
  it.each(['en', 'de', 'it', 'es'])('go to "one" for 1 and to "other" for 0 and every other count, in %s', language => {
    expect(indexes(language, 2, [0, 1, 2, 5, 11, 21, 100])).toEqual([1, 0, 1, 1, 1, 1, 1])
  })
})

describe('three forms (one | few | many)', () => {
  it('are Polish: 1 is one; 2 to 4, 22 to 24 are few; 0, 5 to 21, 25 are many', () => {
    const counts = [0, 1, 2, 3, 4, 5, 11, 12, 14, 21, 22, 24, 25, 112]

    expect(indexes('pl', 3, counts)).toEqual([2, 0, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 2, 2])
  })

  it.each(['ru', 'uk'])('are %s: 1, 21, 101 are one; 2 to 4, 22 to 24 are few; the rest are many', language => {
    const counts = [0, 1, 2, 4, 5, 11, 12, 14, 20, 21, 22, 25, 101, 111]

    expect(indexes(language, 3, counts)).toEqual([2, 0, 1, 1, 2, 2, 2, 2, 2, 0, 1, 2, 0, 2])
  })
})

describe('a message with fewer forms than the language has', () => {
  it('has one form for everything, and the last form for "other"', () => {
    expect(indexes('ru', 1, [0, 1, 2, 5])).toEqual([0, 0, 0, 0])
    expect(indexes('de', 2, [3])).toEqual([1])
  })
})

describe('a message in the interface', () => {
  it('takes the German form for the count: "1 Bit" and "3 Bits"', () => {
    setLanguage('de')
    const { t } = i18n.global

    expect(t('bits.count', { count: 1, names: 'GPS' }, 1)).toBe('1 Bit: GPS')
    expect(t('bits.count', { count: 3, names: 'GPS' }, 3)).toBe('3 Bits: GPS')
  })

  it('keeps the English forms: "1 bit" and "0 bits"', () => {
    const { t } = i18n.global

    expect(t('bits.count', { count: 1, names: 'GPS' }, 1)).toBe('1 bit: GPS')
    expect(t('bits.count', { count: 0, names: 'GPS' }, 0)).toBe('0 bits: GPS')
  })
})

describe('the language of the page', () => {
  it('is on <html lang> after a switch, and back', () => {
    setLanguage('de')
    expect(document.documentElement.lang).toBe('de')
    setLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
