// How a calibration ended, as a toast: the outcome in words, the reason the code gives, the detail the backend or the call gave
// (unless it is one of the vehicle's own texts, which are in the side panel of the calibration pages), and (only when the
// interface cannot be sure the vehicle stopped) the warning to check the values.
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
  /** It stays until it is dismissed: what it says is to be acted on (a failure, a vehicle that may still be calibrating). */
  sticky: boolean
}

/** How each outcome is told: a success is a success only when the vehicle said so; the rest are not. */
const SEVERITY: Readonly<Record<string, Severity>> = {
  success: 'success',
  cancelled: 'info',
  refused: 'warning',
  failed: 'error',
}

/**
 * The detail of a result, unless the vehicle's own texts say it already.
 *
 * @param result what the backend says
 * @param texts the vehicle's own texts of the calibration
 * @returns the detail, or nothing
 */
function detailOf(result: CalibrationResult, texts: readonly string[]): string {
  return result.detail && !texts.includes(result.detail) ? result.detail : ''
}

/**
 * The words of a result: the outcome, the reason of the code, the detail (when the vehicle's texts do not already say it), and
 * the warning of a calibration that may still be going.
 *
 * @param result what the backend says
 * @param say looks up a message
 * @param texts the vehicle's own texts of the calibration
 * @returns the parts that there are
 */
function wordsOf(result: CalibrationResult, say: Say, texts: readonly string[]): string[] {
  const code = result.code ? say(`setup.calibration.code.${result.code}`, result.code) : ''
  const unsure = result.unsure ? say('setup.calibration.unsure') : ''

  return [say(`setup.calibration.result.${result.outcome}`), code, detailOf(result, texts), unsure].filter(Boolean)
}

/**
 * The toast that tells how a calibration ended.
 *
 * @param result what the backend says
 * @param say looks up a message
 * @param texts the vehicle's own texts of the calibration (what they say is not said twice)
 * @returns the toast
 */
export function calibrationToast(result: CalibrationResult, say: Say, texts: readonly string[] = []): CalibrationToast {
  return {
    id: 'calibration-result',
    severity: SEVERITY[result.outcome] ?? 'warning',
    text: wordsOf(result, say, texts).join(' · '),
    long: result.outcome !== 'success',
    sticky: result.outcome === 'failed' || result.unsure === true,
  }
}
