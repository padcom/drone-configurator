import { expect, it } from 'vitest'
import type { Telemetry } from '@/generated/app'
import { DEFAULT_THROTTLE, MAX_THROTTLE, clampThrottle, endedNormally, letterOf, testBlock, testButtons } from './motorTest'

const telemetry = (armed: boolean, heartbeatAgeMs = 100): Telemetry => ({ armed, mode: 'STABILIZE', heartbeatAgeMs })

it('holds a throttle to 1 to 20 percent, whatever was stored or typed', () => {
  expect(MAX_THROTTLE).toBe(20)
  expect(clampThrottle(5)).toBe(5)
  expect(clampThrottle(20)).toBe(20)
  expect(clampThrottle(21)).toBe(20)
  expect(clampThrottle(100)).toBe(20)
  expect(clampThrottle('55')).toBe(20)
  expect(clampThrottle(0)).toBe(1)
  expect(clampThrottle(-4)).toBe(1)
  expect(clampThrottle(7.6)).toBe(8)
  expect(clampThrottle(Infinity)).toBe(DEFAULT_THROTTLE)
  expect(clampThrottle('abc')).toBe(DEFAULT_THROTTLE)
  expect(clampThrottle(undefined)).toBe(DEFAULT_THROTTLE)
  expect(clampThrottle(null)).toBe(DEFAULT_THROTTLE)
})

it('allows a test only for a connected vehicle that is known to be disarmed', () => {
  expect(testBlock(true, telemetry(false), false)).toBeNull()
  expect(testBlock(false, telemetry(false), false)).toBe('offline')
  expect(testBlock(true, null, false)).toBe('unknown')
  // a heartbeat older than 3 s does not say whether it is armed
  expect(testBlock(true, telemetry(false, 3001), false)).toBe('unknown')
  expect(testBlock(true, telemetry(true), false)).toBe('armed')
})

it('does not take the armed flag of its own test for an armed vehicle, but never a vehicle whose state is not known', () => {
  expect(testBlock(true, telemetry(true), true)).toBeNull()
  expect(testBlock(true, telemetry(true, 5000), true)).toBe('unknown')
  expect(testBlock(false, telemetry(true), true)).toBe('offline')
})

it('takes only a let-go button for a test that ended as meant', () => {
  expect(endedNormally('RELEASED')).toBe(true)

  for (const why of ['SILENT', 'LINK_LOST', 'REFUSED', 'UNACKNOWLEDGED', 'ARMED', '']) {
    expect(endedNormally(why), why).toBe(false)
  }
})

it('labels the buttons by the test order, A first, whatever the output', () => {
  expect([1, 2, 3, 4, 12].map(letterOf)).toEqual(['A', 'B', 'C', 'D', 'L'])
})

it('puts the buttons of a quad X where the motors are, in the test order', () => {
  const buttons = testButtons(1, 1) ?? []
  expect(buttons.map(button => button.letter)).toEqual(['A', 'B', 'C', 'D'])
  // [on the right, at the back] of each: A is front right, B back right, C back left, D front left (ArduPilot's quad X)
  const sides = Object.fromEntries(buttons.map(button => [button.letter, [button.left > 50, button.top > 50]]))
  expect(sides).toEqual({ A: [true, false], B: [true, true], C: [false, true], D: [false, false] })
})

it('puts motor A of a quad plus at the front, and has six and eight buttons for a hexa and an octa', () => {
  expect(testButtons(1, 0)?.[0]).toMatchObject({ number: 1, letter: 'A', left: 50, top: 16 })
  expect(testButtons(2, 1)).toHaveLength(6)
  expect(testButtons(3, 0)).toHaveLength(8)
})

it('has no buttons for a frame it has no layout for', () => {
  expect(testButtons(7, 0)).toBeNull()
  expect(testButtons(1, 2)).toBeNull()
  expect(testButtons(0, 0)).toBeNull()
})
