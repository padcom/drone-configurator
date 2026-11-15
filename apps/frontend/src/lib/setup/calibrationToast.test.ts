// How a calibration ends is a toast: the words of the outcome, the reason the code gives, the warning when the vehicle may
// still be calibrating, and never the vehicle's own texts (they are in the side panel).
import { expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { calibrationToast } from './calibrationToast'

const say = (key: string, fallback = ''): string => i18n.global.t(key, fallback)

it('tells a success as a success, short, and a failure as an error that stays long', () => {
  const done = calibrationToast({ kind: 'accel', outcome: 'success', detail: 'Calibration successful' }, say)

  expect(done).toMatchObject({ id: 'calibration-result', severity: 'success', text: 'Calibration done', long: false })
  expect(calibrationToast({ kind: 'accel', outcome: 'failed' }, say)).toMatchObject({ severity: 'error', long: true })
  expect(calibrationToast({ kind: 'compass', outcome: 'cancelled' }, say)).toMatchObject({ severity: 'info' })
  expect(calibrationToast({ kind: 'compass', outcome: 'refused' }, say)).toMatchObject({ severity: 'warning' })
})

it('adds the reason of the code (as it is when it has no words) and the warning that it may still be calibrating', () => {
  const lost = calibrationToast({ kind: 'accel', outcome: 'cancelled', code: 'LINK_LOST' }, say)
  const unknown = calibrationToast({ kind: 'accel', outcome: 'failed', code: 'NOT_A_CODE' }, say)
  const unsure = calibrationToast({ kind: 'accel', outcome: 'success', unsure: true }, say)

  expect(lost.text).toBe('Calibration cancelled · the link to the vehicle was lost')
  expect(unknown.text).toBe('Calibration failed · NOT_A_CODE')
  expect(unsure.text).toContain('check the values before you trust them')
  expect(unsure.long).toBe(true)
})

it('does not repeat the vehicle\'s own words', () => {
  const { text } = calibrationToast({ kind: 'accel', outcome: 'failed', detail: 'Calibration FAILED' }, say)

  expect(text).not.toContain('FAILED')
})
