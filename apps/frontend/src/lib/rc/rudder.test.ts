// The rudder guard of RS1: when the yaw hold is lifted (the option, and a vehicle that is disarmed or armed and landed), and the
// golden vectors the backend's `rudder.pi` is held to as well (`packages/contracts/rudder-vectors.txt`).
import { describe, expect, it } from 'vitest'
import vectors from '../../../../../packages/contracts/rudder-vectors.txt?raw'
import { armedOf, landedOf } from '@/lib/app/armed'
import type { Telemetry } from '@/generated/app'
import { guard, rudderHeld } from './safety'
import { NOT_MINE, type PulseRange, type VehicleChannels } from './types'

const RANGE: PulseRange = { min: 1100, trim: 1500, max: 1900 }
const VEHICLE: VehicleChannels = { throttle: 3, yaw: 4, range: () => RANGE }
const OPEN = { open: true, lows: 0 }

/**
 * Telemetry with a heartbeat of this status and age.
 *
 * @param armed whether the heartbeat says armed
 * @param status the heartbeat's system_status
 * @param age how old the heartbeat is, in ms
 * @returns the telemetry
 */
function telemetry(armed: boolean, status: number, age: number): Telemetry {
  return { armed, mode: 'STABILIZE', heartbeatAgeMs: age, systemStatus: status }
}

/** One golden vector. */
interface Vector {
  name: string
  option: boolean
  armed: 'true' | 'false' | 'unknown'
  status: number
  age: number
  throttle: number
  yaw: number
  expected: number
}

/**
 * The vectors of the file.
 *
 * @returns them
 */
function readVectors(): Vector[] {
  return vectors
    .split('\n')
    .filter(line => line.trim() !== '' && !line.startsWith('#'))
    .map(line => {
      const [name, option, armed, status, age, throttle, yaw, expected] = line.split('|').map(part => part.trim())

      return {
        name: name!,
        option: option === 'on',
        armed: armed as Vector['armed'],
        status: Number(status),
        age: Number(age),
        throttle: throttle === 'own' ? NOT_MINE : Number(throttle),
        yaw: Number(yaw),
        expected: Number(expected),
      }
    })
}

/**
 * The yaw a vector's inputs give, through the page's own functions.
 *
 * @param v the vector
 * @returns the yaw pulse that is sent
 */
function yawOf(v: Vector): number {
  const said = telemetry(v.armed === 'true', v.status, v.age)
  const armed = v.armed === 'unknown' ? undefined : armedOf(said)
  const holdRudder = rudderHeld(v.option, armed, landedOf(said))
  const channels = [NOT_MINE, NOT_MINE, v.throttle, v.yaw, ...Array.from({ length: 12 }, () => NOT_MINE)]

  return guard(channels, VEHICLE, OPEN, { holdRudder }).channels[3]!
}

describe('the golden vectors of the rudder guard (the same as the backend\'s)', () => {
  const all = readVectors()

  it('are enough of them', () => {
    expect(all.length).toBeGreaterThanOrEqual(20)
  })

  it.each(all.map(v => [v.name, v] as const))('give the yaw of: %s', (_name, v) => {
    expect(yawOf(v)).toBe(v.expected)
  })
})

describe('whether the vehicle is landed', () => {
  it('is only a fresh heartbeat that says STANDBY', () => {
    expect(landedOf(telemetry(false, 3, 100))).toBe(true)
    expect(landedOf(telemetry(true, 3, 3000))).toBe(true)

    for (const status of [0, 1, 2, 4, 5, 6, 7, 8, 99]) {
      expect(landedOf(telemetry(true, status, 100))).toBe(false)
    }
    expect(landedOf(telemetry(true, 3, 3001))).toBe(false)
    expect(landedOf(telemetry(true, 3, -1))).toBe(false)
    expect(landedOf(null)).toBe(false)
    expect(landedOf({ armed: true, mode: 'STABILIZE', heartbeatAgeMs: 100 })).toBe(false)
  })
})

describe('whether the yaw is held', () => {
  it('is lifted only by the option, for a vehicle that is disarmed or armed and landed', () => {
    expect(rudderHeld(false, false, true)).toBe(true)
    expect(rudderHeld(false, true, true)).toBe(true)
    expect(rudderHeld(true, false, false)).toBe(false)
    expect(rudderHeld(true, true, true)).toBe(false)
    expect(rudderHeld(true, true, false)).toBe(true)
    expect(rudderHeld(true, undefined, true)).toBe(true)
  })
})
