// A telemetry of a vehicle that is ready to take off (a 3D fix, the EKF's position, on the ground, GUIDED, checks that pass),
// for the tests of Take off: a test changes what it is about.
import type { Telemetry } from '@/generated/app'
import { telemetryAt } from '@/mock/fixtures'

/** The EKF's flags of a vehicle that has its position: attitude, velocity, position (horizontal and vertical, absolute). */
export const EKF_GOOD = 1 | 2 | 4 | 16 | 32

/**
 * The EKF group of a vehicle, with these flags.
 *
 * @param flags the EKF's status flags
 * @returns the group
 */
export function ekfWith(flags: number): NonNullable<Telemetry['ekf']> {
  return {
    flags,
    velocityVariance: 0,
    positionHorizVariance: 0,
    positionVertVariance: 0,
    compassVariance: 0,
    terrainAltVariance: 0,
    ageMs: 100,
  }
}

/**
 * The telemetry of a vehicle that is ready to take off.
 *
 * @param change what is different
 * @returns the telemetry
 */
export function ready(change: Partial<Telemetry> = {}): Telemetry {
  const base = telemetryAt(0)

  return {
    ...base,
    armed: false,
    mode: 'GUIDED',
    prearm: { enabled: true, passing: true, ageMs: 100 },
    gps: { fixType: 3, satellites: 12, ageMs: 100 },
    ekf: ekfWith(EKF_GOOD),
    position: { ...base.position!, relativeAltitude: 0 },
    ...change,
  }
}
