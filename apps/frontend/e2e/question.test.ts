// The pattern that the window specs match the question of a write against: the sentence, then none of the two lines about the
// vehicle's state or one of them, then the changes. A question with any other line is a wrong question, and does not match.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ARMED_LINE, UNKNOWN_LINE, questionPattern } from './click'

const SENTENCE = 'Write 1 parameter to the vehicle?'
const CHANGE = 'RTL_ALT 1500 → 1700'
const ARMED = ARMED_LINE
const UNKNOWN = UNKNOWN_LINE

describe('the two lines about the vehicle\'s state that the window specs expect', () => {
  it('are the English words of the question, as the locale file has them (a changed text fails here, not in a window)', () => {
    const english = JSON.parse(readFileSync(resolve(process.cwd(), 'src/i18n/locales/en.json'), 'utf8')) as {
      question: { armed: string, unknown: string, write: string }
    }

    expect(ARMED_LINE).toBe(english.question.armed)
    expect(UNKNOWN_LINE).toBe(english.question.unknown)
    // (the sentence is the singular of `question.write`)
    expect(SENTENCE).toBe(english.question.write.split(' | ')[0]?.replace('{count}', '1'))
  })
})

describe('the pattern of the question of a write', () => {
  const whole = questionPattern(SENTENCE, 'RTL_ALT 1500 → 1700', true)

  it('takes the question with no line about the state, with the armed one and with the not known one', () => {
    expect(whole.test(`${SENTENCE}\n${CHANGE}`)).toBe(true)
    expect(whole.test(`${SENTENCE}\n${ARMED}\n${CHANGE}`)).toBe(true)
    expect(whole.test(`${SENTENCE}\n${UNKNOWN}\n${CHANGE}`)).toBe(true)
  })

  it('does not take a wrong question: another line, a changed line, two lines, a change that is not the one', () => {
    expect(whole.test(`${SENTENCE}\nThe vehicle is flying: changes take effect now.\n${CHANGE}`)).toBe(false)
    const anything = 'The vehicle\'s state is not known (anything at all): changes take effect now.'

    expect(whole.test(`${SENTENCE}\n${anything}\n${CHANGE}`)).toBe(false)
    expect(whole.test(`${SENTENCE}\n${ARMED}\n${UNKNOWN}\n${CHANGE}`)).toBe(false)
    expect(whole.test(`${SENTENCE}\n${ARMED} And more.\n${CHANGE}`)).toBe(false)
    expect(whole.test(`${SENTENCE}\nRTL_ALT 1500 → 1800`)).toBe(false)
    expect(whole.test(`Write 2 parameters to the vehicle?\n${CHANGE}`)).toBe(false)
  })

  it('is anchored at the start, and at the end only when it is for the whole question', () => {
    const start = questionPattern(SENTENCE, 'RTL_ALT \\d+ → \\d+')

    expect(start.test(`${SENTENCE}\n${ARMED}\nRTL_ALT 1500 → 1700 (a note)`)).toBe(true)
    expect(start.test(`Before. ${SENTENCE}\nRTL_ALT 1500 → 1700`)).toBe(false)
    expect(whole.test(`${SENTENCE}\n${CHANGE} (a note)`)).toBe(false)
  })
})
