import { describe, expect, it } from 'vitest'
import { type Gate, LOW_READS, START_GATE, guard, holdYaw, isLow, nextGate } from './safety'
import { DEFAULT_RANGE, NOT_MINE, type VehicleChannels } from './types'

const vehicle: VehicleChannels = { throttle: 3, yaw: 4, range: () => DEFAULT_RANGE }
const channels = (throttle: number, yaw: number) => [1500, 1500, throttle, yaw, ...Array.from({ length: 12 }, () => NOT_MINE)]
const OPEN: Gate = { open: true, lows: 0 }

/**
 * Reads the stick `times` times in a row.
 *
 * @param gate where the gate starts
 * @param pulse what the stick says each time
 * @param times how many reads
 * @returns the gate after them
 */
function reads(gate: Gate, pulse: number, times: number): Gate {
  let now = gate
  for (let i = 0; i < times; i += 1) {
    now = guard(channels(pulse, 1500), vehicle, now).gate
  }

  return now
}

describe('a throttle that is low', () => {
  it('is within a tenth of its range of the minimum, and the radio\'s own is low too', () => {
    expect(isLow(1000, DEFAULT_RANGE)).toBe(true)
    expect(isLow(1100, DEFAULT_RANGE)).toBe(true)
    expect(isLow(1101, DEFAULT_RANGE)).toBe(false)
    expect(isLow(NOT_MINE, DEFAULT_RANGE)).toBe(true)
  })
})

describe('the throttle gate', () => {
  it('starts shut, and the start is the same object for every control', () => {
    expect(START_GATE).toEqual({ open: false, lows: 0 })
    expect(Object.isFrozen(START_GATE)).toBe(true)
  })

  it('opens only when the stick has been low for several reads in a row, and stays open', () => {
    let gate: Gate = { ...START_GATE }
    for (let i = 1; i < LOW_READS; i += 1) {
      gate = nextGate(gate, 1000, DEFAULT_RANGE)
      expect(gate.open).toBe(false)
    }
    gate = nextGate(gate, 1000, DEFAULT_RANGE)

    expect(gate.open).toBe(true)
    expect(nextGate(gate, 1900, DEFAULT_RANGE).open).toBe(true)
  })
})

describe('the throttle gate, read by read', () => {
  it('is not opened by a single low read between high ones (a glitch, a stick passing through)', () => {
    let gate: Gate = { ...START_GATE }
    for (let i = 0; i < 20; i += 1) {
      gate = nextGate(gate, i % 2 === 0 ? 1000 : 1800, DEFAULT_RANGE)
    }

    expect(gate.open).toBe(false)
    expect(gate.lows).toBeLessThan(LOW_READS)
    expect(nextGate({ open: false, lows: LOW_READS - 1 }, 1800, DEFAULT_RANGE)).toEqual({ open: false, lows: 0 })
  })

  it('does not count a stick the pad does not have (the radio\'s own) for low', () => {
    expect(reads(START_GATE, NOT_MINE, LOW_READS * 2).open).toBe(false)
  })
})

describe('the throttle a gate lets through', () => {
  it('sends no throttle while it is shut, and the other channels as they are', () => {
    const out = guard(channels(1700, 1500), vehicle, START_GATE)

    expect(out.gate.open).toBe(false)
    expect(out.channels[2]).toBe(NOT_MINE)
    expect(out.channels.slice(0, 2)).toEqual([1500, 1500])
  })

  it('sends the throttle, whatever it is, once it is open', () => {
    const opened = reads(START_GATE, 1000, LOW_READS)
    const climbing = guard(channels(1800, 1500), vehicle, opened)

    expect(opened.open).toBe(true)
    expect(guard(channels(1000, 1500), vehicle, opened).channels[2]).toBe(1000)
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
    expect(guard(channels(1000, 2000), vehicle, OPEN).channels[3]).toBe(1900)
    expect(guard(channels(1000, 2000), vehicle, OPEN).yawHeld).toBe(true)
    expect(guard(channels(1000, 1000), vehicle, OPEN).channels[3]).toBe(1100)
  })

  it('is left alone once the throttle is up, and held while the throttle is not sent yet (the radio\'s throttle is low)', () => {
    expect(guard(channels(1500, 2000), vehicle, OPEN).channels[3]).toBe(2000)
    expect(guard(channels(1700, 2000), vehicle, START_GATE).channels[3]).toBe(1900)
    expect(guard(channels(1700, 2000), vehicle, START_GATE).yawHeld).toBe(true)
  })
})

describe('what is checked once more before it leaves', () => {
  it('turns what an override cannot carry into the radio\'s own: not a number, not whole, outside 800 to 2200', () => {
    const bad = [1500, Number.NaN, 1700.5, 3000, 700, Number.POSITIVE_INFINITY, ...Array.from({ length: 10 }, () => 1500)]
    const out = guard(bad, { ...vehicle, throttle: 7, yaw: 8 }, OPEN)

    expect(out.channels.slice(0, 6)).toEqual([1500, NOT_MINE, NOT_MINE, NOT_MINE, NOT_MINE, NOT_MINE])
  })

  it('sends neither the throttle nor the yaw when the range of its channel is not numbers or is upside down', () => {
    const upsideDown = { min: 2000, trim: 1500, max: 1000 }
    const broken = { ...vehicle, range: (channel: number) => (channel === 3 ? upsideDown : DEFAULT_RANGE) }
    const lost = { min: 1000, trim: Number.NaN, max: 2000 }
    const nan = { ...vehicle, range: (channel: number) => (channel === 4 ? lost : DEFAULT_RANGE) }

    expect(guard(channels(1000, 1500), broken, OPEN).channels[2]).toBe(NOT_MINE)
    // (and the gate is shut again: a range that comes back has to see the stick low once more)
    expect(guard(channels(1000, 1500), broken, OPEN).gate.open).toBe(false)
    expect(guard(channels(1000, 1500), nan, OPEN).channels[3]).toBe(NOT_MINE)
  })
})
