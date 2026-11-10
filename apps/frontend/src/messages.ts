// What the interface makes of the texts a vehicle sends (STATUSTEXT), from a VehicleMessage alone (no DOM): how bad one is,
// what it is called, whether it is worth a toast, and whether it is a failsafe. The words come from the translations.
import type { VehicleMessage } from './generated/app'

/** MAVLink's MAV_SEVERITY: 0 emergency, 1 alert, 2 critical, 3 error, 4 warning, 5 notice, 6 info, 7 debug. */
export const WARNING = 4

/** From this severity on (and below) a failsafe is told over the map. */
export const CRITICAL = 2

/** The names of the severities, in order (the messages are `messages.severity.<name>`). */
const NAMES = ['emergency', 'alert', 'critical', 'error', 'warning', 'notice', 'info', 'debug']

/**
 * The name of a severity.
 *
 * @param severity MAVLink's MAV_SEVERITY
 * @returns `warning`, `error` and so on; `debug` for a number past the table
 */
export function severityName(severity: number): string {
  return NAMES[severity] ?? 'debug'
}

/**
 * Whether a message is a warning or worse: one that is told with a word and a mark, and with a toast.
 *
 * @param message the message
 * @returns true for severity 4 and below
 */
export function isWarning(message: VehicleMessage): boolean {
  return message.severity <= WARNING
}

/**
 * How a message is told in a toast: an error for an error or worse, a warning for a warning, nothing for the rest.
 *
 * @param message the message
 * @returns the toast's severity, or undefined for a message that gets none
 */
export function toastSeverity(message: VehicleMessage): 'error' | 'warning' | undefined {
  if (message.severity <= 3) {
    return 'error'
  }

  return message.severity === WARNING ? 'warning' : undefined
}

/**
 * Whether a message is a failsafe that has taken over (critical or worse, and it says so): told over the map until it is
 * dismissed.
 *
 * @param message the message
 * @returns true for a failsafe
 */
export function isFailsafe(message: VehicleMessage): boolean {
  return message.severity <= CRITICAL && /failsafe/iu.test(message.text)
}

/**
 * When a message was sent, as a date. (The backend sends milliseconds since 1970, as a number or a bigint.)
 *
 * @param message the message
 * @returns the date
 */
export function sentAt(message: VehicleMessage): Date {
  return new Date(Number(message.time))
}
