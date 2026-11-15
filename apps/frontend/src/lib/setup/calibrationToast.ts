// How a calibration ended, as a toast: the outcome in words, the reason the code gives, and (only when the interface cannot be
// sure the vehicle stopped) the warning to check the values. The vehicle's own words are not here: they are in the side panel
// of the calibration pages while it runs and after.
import type { CalibrationResult } from '@/generated/app'
import type { Severity } from '@/composables/toasts'

/** Looks up a message; the second argument is what to say when there is none. */
export type Say = (key: string, fallback?: string) => string

/** The toast of a result. */
export interface CalibrationToast {
  /** Names the kind of event, so that one calibration's end is one toast. */
  id: string
  /** How it is told. */
  severity: Severity
  /** The words. */
  text: string
  /** It stays as long as an error does: what it says has to be read. */
  long: boolean
}

/** How each outcome is told: a success is a success only when the vehicle said so; the rest are not. */
const SEVERITY: Readonly<Record<string, Severity>> = {
  success: 'success',
  cancelled: 'info',
  refused: 'warning',
  failed: 'error',
}

/**
 * The words of a result: the outcome, the reason of the code, and the warning of a calibration that may still be going.
 *
 * @param result what the backend says
 * @param say looks up a message
 * @returns the parts that there are
 */
function wordsOf(result: CalibrationResult, say: Say): string[] {
  const code = result.code ? say(`setup.calibration.code.${result.code}`, result.code) : ''
  const unsure = result.unsure ? say('setup.calibration.unsure') : ''

  return [say(`setup.calibration.result.${result.outcome}`), code, unsure].filter(Boolean)
}

/**
 * The toast that tells how a calibration ended.
 *
 * @param result what the backend says
 * @param say looks up a message
 * @returns the toast
 */
export function calibrationToast(result: CalibrationResult, say: Say): CalibrationToast {
  return {
    id: 'calibration-result',
    severity: SEVERITY[result.outcome] ?? 'warning',
    text: wordsOf(result, say).join(' · '),
    long: result.outcome !== 'success' || result.unsure === true,
  }
}
