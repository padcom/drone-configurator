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
