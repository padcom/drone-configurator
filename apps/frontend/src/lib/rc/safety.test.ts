import { describe, expect, it } from 'vitest'
import { guard, holdYaw, isLow, nextThrottleState } from './safety'
import { DEFAULT_RANGE, NOT_MINE, type VehicleChannels } from './types'

const vehicle: VehicleChannels = { throttle: 3, yaw: 4, range: () => DEFAULT_RANGE }
const channels = (throttle: number, yaw: number) => [1500, 1500, throttle, yaw, ...Array.from({ length: 12 }, () => NOT_MINE)]

describe('a throttle that is low', () => {
  it('is within a tenth of its range of the minimum, and the radio\'s own is low too', () => {
    expect(isLow(1000, DEFAULT_RANGE)).toBe(true)
    expect(isLow(1100, DEFAULT_RANGE)).toBe(true)
    expect(isLow(1101, DEFAULT_RANGE)).toBe(false)
    expect(isLow(NOT_MINE, DEFAULT_RANGE)).toBe(true)
  })
})

describe('the throttle gate', () => {
  it('waits for the stick to be low, once, and stays open from then on', () => {
    expect(nextThrottleState('waiting', 1600, DEFAULT_RANGE)).toBe('waiting')
    expect(nextThrottleState('waiting', NOT_MINE, DEFAULT_RANGE)).toBe('waiting')
    expect(nextThrottleState('waiting', 1050, DEFAULT_RANGE)).toBe('open')
    expect(nextThrottleState('open', 1900, DEFAULT_RANGE)).toBe('open')
  })

  it('sends no throttle while it waits, and the other channels as they are', () => {
    const out = guard(channels(1700, 1500), vehicle, 'waiting')

    expect(out.state).toBe('waiting')
    expect(out.channels[2]).toBe(NOT_MINE)
    expect(out.channels.slice(0, 2)).toEqual([1500, 1500])
  })

  it('opens when the stick is low, and sends the throttle from then on, whatever it is', () => {
    const opened = guard(channels(1000, 1500), vehicle, 'waiting')
    const climbing = guard(channels(1800, 1500), vehicle, opened.state)

    expect(opened.state).toBe('open')
    expect(opened.channels[2]).toBe(1000)
    expect(climbing.channels[2]).toBe(1800)
  })
})

describe('the rudder', () => {
  it('is held back from the ends of its travel while the throttle is low, on both sides', () => {
    expect(holdYaw(2000, DEFAULT_RANGE)).toEqual({ pulse: 1900, held: true })
    expect(holdYaw(1000, DEFAULT_RANGE)).toEqual({ pulse: 1100, held: true })
    expect(holdYaw(1890, DEFAULT_RANGE)).toEqual({ pulse: 1890, held: false })
    expect(holdYaw(NOT_MINE, DEFAULT_RANGE)).toEqual({ pulse: NOT_MINE, held: false })
  })

  it('is never sent at the end of its travel with the throttle low: the vehicle would take it for arming or disarming', () => {
    const open = 'open' as const

    expect(guard(channels(1000, 2000), vehicle, open).channels[3]).toBe(1900)
    expect(guard(channels(1000, 2000), vehicle, open).yawHeld).toBe(true)
    expect(guard(channels(1000, 1000), vehicle, open).channels[3]).toBe(1100)
  })

  it('is left alone once the throttle is up, or when the throttle is not sent yet (the radio\'s throttle is low: held)', () => {
    expect(guard(channels(1500, 2000), vehicle, 'open').channels[3]).toBe(2000)
    expect(guard(channels(1700, 2000), vehicle, 'waiting').channels[3]).toBe(1900)
    expect(guard(channels(1700, 2000), vehicle, 'waiting').yawHeld).toBe(true)
  })
})
