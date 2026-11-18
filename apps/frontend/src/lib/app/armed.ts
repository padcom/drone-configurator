import type { Telemetry } from '@/generated/app'

/** Telemetry older than this (ms) does not say whether the vehicle is armed: it is not known. */
export const HEARTBEAT_FRESH_MS = 3000

/**
 * Whether the vehicle is armed, as far as the latest telemetry says.
 *
 * @param telemetry the latest telemetry, or null
 * @returns true or false, or undefined when it is not known (no telemetry, or no recent heartbeat); callers treat that as armed
 */
export function armedOf(telemetry: Telemetry | null): boolean | undefined {
  return telemetry !== null && telemetry.heartbeatAgeMs <= HEARTBEAT_FRESH_MS ? telemetry.armed : undefined
}

/** The heartbeat's `system_status` (MAV_STATE) that ArduCopter sends exactly when it is landed and no failsafe is active. */
export const STATUS_STANDBY = 3

/**
 * Whether the vehicle is landed, as far as the latest telemetry says: its heartbeat is recent and its `system_status` is
 * STANDBY (ArduCopter's `land_complete`, with no failsafe). Anything else is "not landed": no telemetry, an old heartbeat, ACTIVE
 * (flying), CRITICAL (a failsafe is active), BOOT, a status that is not known.
 *
 * @param telemetry the latest telemetry, or null
 * @returns true only when the vehicle says it is on the ground
 */
export function landedOf(telemetry: Telemetry | null): boolean {
  if (telemetry === null || telemetry.heartbeatAgeMs < 0 || telemetry.heartbeatAgeMs > HEARTBEAT_FRESH_MS) {
    return false
  }

  return telemetry.systemStatus === STATUS_STANDBY
}
