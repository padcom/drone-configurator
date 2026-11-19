import { describe, expect, it } from 'vitest'
import { REST_READS } from './rest'
import { type Gate, START_GATE, guard, holdYaw, isLow, lowRead, nextGate } from './safety'
import { DEFAULT_RANGE, NOT_MINE, type VehicleChannels } from './types'

const vehicle: VehicleChannels = { throttle: 3, yaw: 4, range: () => DEFAULT_RANGE }
const channels = (throttle: number, yaw: number) => [1500, 1500, throttle, yaw, ...Array.from({ length: 12 }, () => NOT_MINE)]
const OPEN: Gate = { open: true, reads: 0 }

/**
 * Reads the sticks `times` times in a row.
 *
 * @param gate where the gate starts
 * @param rested whether the sticks are at rest each time
 * @param times how many reads
 * @returns the gate after them
 */
function reads(gate: Gate, rested: boolean, times: number): Gate {
  let now = gate
  for (let i = 0; i < times; i += 1) {
    now = nextGate(now, rested)
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

  it('counts as a read of the stick only when the pad has the stick', () => {
    const counted = [1000, NOT_MINE, 1500].map(pulse => lowRead(pulse, DEFAULT_RANGE, 0))

    expect(counted).toEqual([true, false, false])
  })
})

describe('the gate', () => {
  it('starts shut, and the start is the same object for every control', () => {
    expect(START_GATE).toEqual({ open: false, reads: 0 })
    expect(Object.isFrozen(START_GATE)).toBe(true)
  })

  it('opens only when the sticks have been at rest for REST_READS reads in a row, and stays open', () => {
    const almost = reads(START_GATE, true, REST_READS - 1)

    expect(almost.open).toBe(false)
    expect(nextGate(almost, true).open).toBe(true)
    expect(nextGate(nextGate(almost, true), false).open).toBe(true)
  })

  it('is not opened by a single read at rest between others (a glitch, a stick passing through)', () => {
    let gate: Gate = { ...START_GATE }
    for (let i = 0; i < 40; i += 1) {
      gate = nextGate(gate, i % 2 === 0)
    }

    expect(gate.open).toBe(false)
    expect(nextGate({ open: false, reads: REST_READS - 1 }, false)).toEqual({ open: false, reads: 0 })
  })

  it('waits for ten reads: 200 ms at fifty reads a second', () => {
    expect(REST_READS).toBe(10)
  })
})

describe('what a gate lets through', () => {
  it('sends nothing while it is shut: every channel is the radio\'s own, whatever the sticks say', () => {
    const out = guard(channels(1700, 1500), vehicle, START_GATE, { rested: false })

    expect(out.gate.open).toBe(false)
    expect(out.channels.every(pulse => pulse === NOT_MINE)).toBe(true)
  })

  it('opens by what the caller says of the sticks, and sends the channels as they are once it is open', () => {
    const opened = reads(START_GATE, true, REST_READS)

    expect(guard(channels(1800, 1500), vehicle, opened).channels.slice(0, 3)).toEqual([1500, 1500, 1800])
    expect(guard(channels(1000, 1500), vehicle, opened).channels[2]).toBe(1000)
    expect(guard(channels(1500, 1500), vehicle, START_GATE, { rested: true }).gate.reads).toBe(1)
  })

  it('looks at the throttle alone being low when the caller does not say (the first rule)', () => {
    expect(guard(channels(1000, 1500), vehicle, START_GATE).gate.reads).toBe(1)
    expect(guard(channels(1700, 1500), vehicle, START_GATE).gate.reads).toBe(0)
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

  it('is left alone once the throttle is up', () => {
    expect(guard(channels(1500, 2000), vehicle, OPEN).channels[3]).toBe(2000)
    expect(guard(channels(1500, 2000), vehicle, OPEN).yawHeld).toBe(false)
  })

  it('is held with a centred throttle whatever the throttle is: the middle is not low, and a disarm asks nothing of it', () => {
    const centred = { centred: true }

    expect(guard(channels(1500, 2000), vehicle, OPEN, centred).channels[3]).toBe(1900)
    expect(guard(channels(1500, 1000), vehicle, OPEN, centred).channels[3]).toBe(1100)
    expect(guard(channels(1500, 2000), vehicle, OPEN, centred).yawHeld).toBe(true)
    expect(guard(channels(1800, 2000), vehicle, OPEN, { centred: true, holdRudder: false }).channels[3]).toBe(2000)
  })
})

describe('the rudder, when the person lifted its hold (the sticks arm and disarm the simulator)', () => {
  const lifted = { holdRudder: false }

  it('goes to the ends of its travel with the throttle low, on both sides, and is not said to be held', () => {
    expect(guard(channels(1000, 2000), vehicle, OPEN, lifted).channels[3]).toBe(2000)
    expect(guard(channels(1000, 1000), vehicle, OPEN, lifted).channels[3]).toBe(1000)
    expect(guard(channels(1000, 2000), vehicle, OPEN, lifted).yawHeld).toBe(false)
  })

  it('is held when the option says to, and by default (the hold is only ever lifted by asking)', () => {
    expect(guard(channels(1000, 2000), vehicle, OPEN, { holdRudder: true }).channels[3]).toBe(1900)
    expect(guard(channels(1000, 2000), vehicle, OPEN, {}).channels[3]).toBe(1900)
  })

  it('changes nothing else: the gate stays shut, and a yaw whose range cannot be used is still the radio\'s own', () => {
    const shut = guard(channels(1700, 2000), vehicle, START_GATE, { ...lifted, rested: false })

    expect(shut.channels[2]).toBe(NOT_MINE)
    expect(shut.gate.open).toBe(false)
    const flipped = { min: 2000, max: 1000, trim: 1500 }
    const upside = { ...vehicle, range: (channel: number) => (channel === 4 ? flipped : DEFAULT_RANGE) }

    expect(guard(channels(1000, 2000), upside, OPEN, lifted).channels[3]).toBe(NOT_MINE)
    expect(guard(channels(1000, 2000), vehicle, OPEN, lifted).channels[2]).toBe(1000)
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
    // (and the gate is shut again: a range that comes back has to see the sticks at rest once more)
    expect(guard(channels(1000, 1500), broken, OPEN).gate.open).toBe(false)
    expect(guard(channels(1000, 1500), nan, OPEN).channels[3]).toBe(NOT_MINE)
  })
})
