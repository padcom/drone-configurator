// A telemetry of a vehicle that is in the air, in GUIDED, with its position and home, for the tests of guided control: a test
// changes what it
// is about.
import type { Telemetry } from '@/generated/app'
import { ready } from './takeoff'

/** Where home is in the tests, and a place 55 m north of it. */
export const HOME = { lat: 52.2297, lon: 21.0122 }

export const NORTH = { lat: 52.2302, lon: 21.0122 }

/**
 * The telemetry of an armed vehicle in GUIDED, 20 m up over home, with a fresh position and home.
 *
 * @param change what is different
 * @returns the telemetry
 */
export function inTheAir(change: Partial<Telemetry> = {}): Telemetry {
  const base = ready()

  return {
    ...base,
    armed: true,
    mode: 'GUIDED',
    position: { ...base.position!, lat: HOME.lat, lon: HOME.lon, relativeAltitude: 20, ageMs: 100 },
    home: { ...HOME, altitude: 100, ageMs: 100 },
    ...change,
  }
}
