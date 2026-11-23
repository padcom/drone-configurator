// What the dialog shows of the backend's serial detection (#27): the port it would use, and the reasons a detection failed.
import type { SerialPort } from '@/generated/app'

/** The codes of a failed serial detection (`connection.errorCode`): each has its own next step in the dialog. */
export const DETECT_CODES: readonly string[] = ['NO_SERIAL_PORT', 'NO_AUTOPILOT_PORT', 'PORT_GONE', 'NO_MAVLINK']

/**
 * The port the backend would use for a serial link without a device.
 *
 * @param ports the ports listed
 * @returns its path, or null when the backend could not tell
 */
export function likelyPath(ports: readonly SerialPort[]): string | null {
  return ports.find(port => port.likely === true)?.path ?? null
}
