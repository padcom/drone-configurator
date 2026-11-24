// What the Signing page and the status bar say of each state of the link's signing, why a change is not possible, the words of
// the backend's refusals, and what is wrong with a passphrase. Every message they name is in every language.
import { expect, it } from 'vitest'
import { LANGUAGES, i18n } from '@/i18n/i18n'
import { MAX_PASSPHRASE, type SigningState, passphraseProblem, signingBlocked, signingErrorKey, signingLook } from './signing'

/**
 * Whether a message is in every language.
 *
 * @param key its key
 * @returns the languages that lack it
 */
function missing(key: string): string[] {
  return LANGUAGES.filter(language => !i18n.global.te(key, language))
}

const STATES: SigningState[] = ['off', 'signed', 'no-answer', 'unknown-key']

it('shows each state with an icon and words, and a tone only for signed or a key that does not answer', () => {
  expect(STATES.map(s => signingLook(s).icon)).toEqual(['unlock', 'lock', 'warning', 'warning'])
  expect(STATES.map(s => signingLook(s).tone)).toEqual(['none', 'ok', 'warn', 'warn'])

  for (const s of STATES) {
    const look = signingLook(s)
    for (const key of [look.wordKey, look.titleKey, look.noteKey]) {
      expect(missing(key), key).toEqual([])
    }
  }
})

it('allows a change only with a vehicle known to be disarmed and nothing under way', () => {
  expect(signingBlocked(false, false, false)).toBe('setup.signing.blocked.offline')
  expect(signingBlocked(true, undefined, false)).toBe('setup.signing.blocked.unknown')
  expect(signingBlocked(true, true, false)).toBe('setup.signing.blocked.armed')
  expect(signingBlocked(true, false, true)).toBe('setup.signing.blocked.busy')
  expect(signingBlocked(true, false, false)).toBeNull()
})

it('has words for each refusal of the backend, and general ones for any other', () => {
  const codes = [
    'NOT_CONNECTED', 'ARMED', 'STATE_UNKNOWN', 'BUSY', 'NO_VEHICLE_ID', 'INVALID_VALUE', 'NOT_SAVED', 'NOT_CONFIRMED', 'ABORTED',
  ]

  for (const code of codes) {
    expect(signingErrorKey(code)).toBe(`setup.signing.error.${code}`)
    expect(missing(signingErrorKey(code)), code).toEqual([])
  }
  expect(signingErrorKey('SOMETHING_NEW')).toBe('setup.signing.error.other')
  expect(missing('setup.signing.error.other')).toEqual([])
})

it('takes a passphrase of 1 to 256 characters', () => {
  expect(passphraseProblem('')).toBe('empty')
  expect(passphraseProblem('a')).toBeNull()
  expect(passphraseProblem('x'.repeat(MAX_PASSPHRASE))).toBeNull()
  expect(passphraseProblem('x'.repeat(MAX_PASSPHRASE + 1))).toBe('long')
})
