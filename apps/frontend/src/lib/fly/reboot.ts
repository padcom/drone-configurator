// How the interface follows a reboot of the flight controller: the backend reports the quiet that follows an accepted reboot as
// `reconnecting` with the stable code REBOOTING, and the vehicle's return as `connected` with `resumed`.
import type { Connection } from '@/generated/app'

/**
 * Whether the link is down because the vehicle is rebooting (the backend says so with a stable code).
 *
 * @param connection the link's state
 * @returns true while it is being brought back after a reboot
 */
export function isRebooting(connection: Connection): boolean {
  return connection.state === 'reconnecting' && connection.errorCode === 'REBOOTING'
}

/** Where a reboot stands after a report of the connection. */
export interface RebootProgress {
  /** Whether a reboot is under way (the link went quiet because of it, and the vehicle has not come back). */
  rebooting: boolean
  /** Whether the vehicle has just come back, the same one: it is welcome. */
  back: boolean
}

/**
 * Whether a report is the same vehicle's return.
 *
 * @param connection what the backend reported
 * @returns true for `connected` that is `resumed`
 */
function cameBack(connection: Connection): boolean {
  return connection.state === 'connected' && connection.resumed === true
}

/**
 * What a report of the connection makes of a reboot. A reboot under way stays so through the tries (more `reconnecting` reports
 * follow), ends with the vehicle's return, and ends with anything else (the user disconnected, a link that did not come back).
 *
 * @param before whether a reboot was under way
 * @param connection what the backend reported
 * @returns whether one is under way now, and whether the vehicle is back
 */
export function rebootProgress(before: boolean, connection: Connection): RebootProgress {
  if (isRebooting(connection)) {
    return { rebooting: true, back: false }
  }

  return { rebooting: before && connection.state === 'reconnecting', back: before && cameBack(connection) }
}
