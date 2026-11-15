// The pre-arm checks as the page tells them: how the vehicle says they are (its bit), and the reasons, which are its own words
// from the last two minutes, each once.
import { describe, expect, it } from 'vitest'
import type { Telemetry, VehicleMessage } from '@/generated/app'
import { REASON_WINDOW_MS, checksOf, reasonsOf } from './prearm'

const NOW = 1_000_000_000_000

/**
 * A message of the vehicle.
 *
 * @param text what it said
 * @param agoMs how long ago
 * @returns the message
 */
function said(text: string, agoMs: number): VehicleMessage {
  return { id: 1, time: NOW - agoMs, system: 1, component: 1, severity: 4, text, truncated: false }
}

/**
 * Telemetry with this pre-arm group.
 *
 * @param prearm the group, if the vehicle says one
 * @param prearm.enabled whether the vehicle has an arming check on
 * @param prearm.passing whether its checks pass
 * @returns the telemetry
 */
function telemetry(prearm?: { enabled: boolean, passing: boolean }): Telemetry {
  return { armed: false, mode: 'STABILIZE', heartbeatAgeMs: 100, ...(prearm && { prearm: { ...prearm, ageMs: 100 } }) }
}

describe('how the vehicle says its checks are', () => {
  it.each([
    [{ enabled: true, passing: true }, 'passing'],
    [{ enabled: true, passing: false }, 'failing'],
    [{ enabled: false, passing: false }, 'off'],
    [undefined, 'unknown'],
  ] as const)('is %j: %s', (group, state) => {
    expect(checksOf(telemetry(group))).toBe(state)
  })

  it('is not known without telemetry', () => {
    expect(checksOf(null)).toBe('unknown')
  })
})

describe('the reasons the vehicle gave', () => {
  it('are its PreArm and Arm texts, as it said them, the oldest first', () => {
    const messages = [
      said('PreArm: Compasses inconsistent', 30_000),
      said('EKF3 IMU0 is using GPS', 20_000),
      said('Arm: RTL mode not armable', 10_000),
    ]

    expect(reasonsOf(messages, NOW)).toEqual([
      { text: 'PreArm: Compasses inconsistent', ageMs: 30_000 },
      { text: 'Arm: RTL mode not armable', ageMs: 10_000 },
    ])
  })

  it('take a text once, with the time it was last said, wherever it came in the list', () => {
    const gps = 'PreArm: GPS 1: Bad fix'
    const messages = [said(gps, 90_000), said('PreArm: RC not found', 60_000), said(gps, 5000)]

    expect(reasonsOf(messages, NOW)).toEqual([
      { text: 'PreArm: RC not found', ageMs: 60_000 },
      { text: 'PreArm: GPS 1: Bad fix', ageMs: 5000 },
    ])
  })

  it('leave out what was said more than two minutes ago, and every other text', () => {
    const old = said('PreArm: old', REASON_WINDOW_MS + 1)
    const messages = [old, said('Arming motors', 1000), said('PreArm: recent', REASON_WINDOW_MS)]

    expect(reasonsOf(messages, NOW)).toEqual([{ text: 'PreArm: recent', ageMs: REASON_WINDOW_MS }])
  })
})

describe('when there is nothing to list', () => {
  it('are none when the vehicle said none', () => {
    expect(reasonsOf([], NOW)).toEqual([])
  })
})
