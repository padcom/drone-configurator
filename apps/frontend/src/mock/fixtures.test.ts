import { describe, expect, it } from 'vitest'
import { telemetryAt } from './fixtures'

/** The groups the flight screens read (#26), each of which the mock's vehicle reports. */
const GROUPS = [
  'position', 'home', 'gps', 'speed', 'nav', 'wind', 'ekf', 'vibration', 'battery', 'attitude', 'rc', 'servo',
] as const

describe('the mock vehicle\'s telemetry', () => {
  it('has every group the flight screens read, each with its age', () => {
    const t = telemetryAt(4)

    for (const name of GROUPS) {
      expect(t[name]?.ageMs, name).toBe(200)
    }
  })

  it('has the altitudes, speeds, throttle, the way to the next waypoint and the estimator\'s flags', () => {
    const t = telemetryAt(4)

    expect(t.position).toMatchObject({ altitude: 488, relativeAltitude: 20 })
    expect(t.speed).toMatchObject({ groundspeed: 1, climb: 0, throttle: 40 })
    expect(t.nav).toMatchObject({ waypointDistance: 112, targetBearing: 90 })
    expect(t.ekf?.flags).toBe(831)
    expect(t.vibration?.clipping).toEqual([0, 0, 0])
  })

  it('moves on with each tick: the way gets shorter and the wind veers', () => {
    const [before, after] = [telemetryAt(0), telemetryAt(10)]

    expect(after.nav!.waypointDistance).toBeLessThan(before.nav!.waypointDistance)
    expect(after.wind!.direction).not.toBe(before.wind!.direction)
  })
})
