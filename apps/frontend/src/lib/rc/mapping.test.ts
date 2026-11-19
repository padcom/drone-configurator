// The mapping math: a pad channel from -1 to 1 (nothing calibrated), the dead zone, the curve and the pulse of a channel; the 16
// pulses of a profile.
import { describe, expect, it } from 'vitest'
import { applyDeadZone, applyExpo, channelsOf, levelOf, normalise, rangeOk, rowPulse, sendableOr, toPulse } from './mapping'
import { newRow } from './suggest'
import { DEFAULT_RANGE, NOT_MINE, type Profile, type PulseRange, type Row } from './types'
import { plain, sample } from '@/testing/rcSamples'

describe('a pad channel as a number from -1 to 1', () => {
  it('is what the device says, held to -1 and 1: nothing is calibrated', () => {
    expect([-1, -0.25, 0, 0.5, 1].map(normalise)).toEqual([-1, -0.25, 0, 0.5, 1])
    expect([-3, 2, Infinity, -Infinity].map(normalise)).toEqual([-1, 1, 0, 0])
    expect(normalise(Number.NaN)).toBe(0)
  })

  it('is turned by inversion', () => {
    expect(levelOf(plain(1, { invert: true }), sample(0.4))).toBe(-0.4)
  })

  it('is null for a row with no source, a channel the pad has not, or a reading that is not a number', () => {
    expect(levelOf(plain(0), sample(0.4))).toBeNull()
    expect(levelOf(plain(2), sample(0.4))).toBeNull()
    expect(levelOf(plain(1), sample(Number.NaN))).toBeNull()
  })
})

describe('the dead zone and the curve', () => {
  it('takes the zone out of the middle and stretches the rest to the ends', () => {
    const stretched = [0, 0.05, -0.1, 0.55, 1, -1].map(value => applyDeadZone(value, 0.1))

    expect(stretched.map(value => Math.round(value * 1e9) / 1e9)).toEqual([0, 0, 0, 0.5, 1, -1])
  })

  it('is a line at 0 and a cube at 1, the same at the ends', () => {
    expect(applyExpo(0.5, 0)).toBe(0.5)
    expect(applyExpo(0.5, 1)).toBe(0.125)
    expect([applyExpo(1, 0.5), applyExpo(-1, 0.5)]).toEqual([1, -1])
  })
})

describe('a pulse through the range of its channel', () => {
  it('is the minimum at -1, the trim at 0 and the maximum at 1, with a slope on each side', () => {
    const range: PulseRange = { min: 1100, trim: 1400, max: 1900 }

    expect([-1, -0.5, 0, 0.5, 1].map(value => toPulse(value, range))).toEqual([1100, 1250, 1400, 1650, 1900])
  })

  it('is a row\'s own ends when it has them: a line from the pulse at -1 to the pulse at 1', () => {
    const row = plain(1, { pulseMin: 1000, pulseMax: 2000 })

    expect([-1, 0, 1].map(value => rowPulse(row, sample(value), DEFAULT_RANGE))).toEqual([1000, 1500, 2000])
    expect(rowPulse(plain(1, { pulseMin: 1200, pulseMax: 1800 }), sample(0.5), DEFAULT_RANGE)).toBe(1650)
  })

  it('is the radio\'s own for what the pad does not have, and for a row with no source', () => {
    expect(rowPulse(plain(5), sample(1), DEFAULT_RANGE)).toBe(NOT_MINE)
    expect(rowPulse(plain(0), sample(1), DEFAULT_RANGE)).toBe(NOT_MINE)
  })

  it('is a straight line from RCn_MIN to RCn_MAX for a range whose trim is in the middle (the throttle, either style)', () => {
    const range: PulseRange = { min: 1000, trim: 1500, max: 2000 }

    expect([-1, 0, 1].map(value => rowPulse(plain(1), sample(value), range))).toEqual([1000, 1500, 2000])
  })

  it('has a dead zone that is exactly the middle pulse, and the rest stretched to the ends', () => {
    const row = plain(1, { deadZone: 0.1 })

    expect([0.09, -0.09, 0.55, 1].map(value => rowPulse(row, sample(value), DEFAULT_RANGE))).toEqual([1500, 1500, 1750, 2000])
  })
})

const profile = (rows: Row[], confirmedKey: string | null = 'k'): Profile => ({
  device: 'pad',
  rows,
  throttleStyle: 'low',
  confirmedKey,
})
const own = () => DEFAULT_RANGE

describe('the 16 pulses of a profile', () => {
  it('are the pulses of the rows, and the radio\'s own for every channel no row drives', () => {
    const pulses = channelsOf(profile([newRow(1, 1), newRow(4, 2)]), sample(1, -1), own)

    expect(pulses).toEqual([2000, 0, 0, 1000, ...Array.from({ length: 12 }, () => 0)])
  })

  it('take the range of each channel from the vehicle', () => {
    const range = (channel: number) => (channel === 1 ? DEFAULT_RANGE : { min: 1100, trim: 1500, max: 1900 })
    const pulses = channelsOf(profile([newRow(1, 1), newRow(2, 1)]), sample(1), range)

    expect(pulses.slice(0, 2)).toEqual([2000, 1900])
  })

  it('drive nothing for a mapping that was never confirmed, whatever it says', () => {
    expect(channelsOf(profile([newRow(1, 1)], null), sample(1), own).every(pulse => pulse === NOT_MINE)).toBe(true)
  })
})

describe('the 16 pulses of a profile that is wrong', () => {
  it('skip a row on a channel that is not one of the 16, and leave a good row beside it alone', () => {
    const pulses = channelsOf(profile([newRow(17, 1), newRow(0, 1), newRow(2, 1)]), sample(1), own)

    expect(pulses.length).toBe(16)
    expect(pulses[1]).toBe(2000)
  })

  it('never carry what is not a pulse: a range that is upside down', () => {
    const upside: PulseRange = { min: 1900, trim: 1500, max: 1100 }

    expect(channelsOf(profile([newRow(1, 1)]), sample(1), () => upside)[0]).toBe(NOT_MINE)
  })

  it('never carry what is not a pulse: ends of 3000 µs, a zone that is not a number', () => {
    const wide = plain(1, { channel: 1, pulseMin: 1000, pulseMax: 3000 })
    const nan = plain(1, { channel: 1, deadZone: Number.NaN })

    expect(channelsOf(profile([wide]), sample(1), own)[0]).toBe(NOT_MINE)
    expect(channelsOf(profile([nan]), sample(0.5), own)[0]).toBe(NOT_MINE)
  })
})

describe('what a pulse and a range may be', () => {
  it('sends a pulse an override carries, and else the radio\'s own', () => {
    expect([0, 800, 1500, 2200].map(sendableOr)).toEqual([0, 800, 1500, 2200])
    expect([799, 2201, 1500.5, Number.NaN].map(sendableOr)).toEqual([0, 0, 0, 0])
  })

  it('uses a range in the order min, trim, max with pulses that an override carries', () => {
    expect(rangeOk(DEFAULT_RANGE)).toBe(true)
    expect(rangeOk({ min: 1500, trim: 1000, max: 2000 })).toBe(false)
    expect(rangeOk({ min: 500, trim: 1500, max: 2000 })).toBe(false)
  })
})
