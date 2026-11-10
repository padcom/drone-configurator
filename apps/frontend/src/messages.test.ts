import { describe, expect, it } from 'vitest'
import type { VehicleMessage } from './generated/app'
import { isFailsafe, isWarning, sentAt, severityName, toastSeverity } from './messages'

/**
 * A message of a severity.
 *
 * @param severity MAVLink's severity
 * @param text what it says
 * @returns the message
 */
const say = (severity: number, text = 'text'): VehicleMessage => (
  { id: 1, time: 0, system: 1, component: 1, severity, text, truncated: false }
)

describe('the severity of a message', () => {
  it('has MAVLink\'s names, and debug for what is past the table', () => {
    expect([0, 2, 3, 4, 5, 6, 7, 9].map(severityName))
      .toEqual(['emergency', 'critical', 'error', 'warning', 'notice', 'info', 'debug', 'debug'])
  })

  it('is a warning from 4 down, and not from 5 up', () => {
    expect([0, 3, 4, 5, 6].map(severity => isWarning(say(severity)))).toEqual([true, true, true, false, false])
  })

  it('makes an error toast for an error or worse, a warning toast for a warning, and none for the rest', () => {
    expect([0, 2, 3, 4, 5, 6].map(severity => toastSeverity(say(severity))))
      .toEqual(['error', 'error', 'error', 'warning', undefined, undefined])
  })
})

describe('a failsafe', () => {
  it('is a critical message that says failsafe, in any case', () => {
    expect(isFailsafe(say(2, 'Battery failsafe: returning home'))).toBe(true)
    expect(isFailsafe(say(0, 'Radio FAILSAFE'))).toBe(true)
  })

  it('is not a warning that says failsafe, nor a critical message that does not', () => {
    expect(isFailsafe(say(4, 'Failsafe is armed'))).toBe(false)
    expect(isFailsafe(say(2, 'Compass variance'))).toBe(false)
  })
})

describe('the time of a message', () => {
  it('is the milliseconds since 1970 that the backend sends, as a number or a bigint', () => {
    expect(sentAt({ ...say(6), time: 1_700_000_000_000 }).toISOString()).toBe('2023-11-14T22:13:20.000Z')
    expect(sentAt({ ...say(6), time: 1_700_000_000_000n }).toISOString()).toBe('2023-11-14T22:13:20.000Z')
  })
})
