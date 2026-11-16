import { describe, expect, it } from 'vitest'
import {
  applyDeadZone,
  applyExpo,
  buttonPulse,
  channelsOf,
  normalise,
  stickPulse,
  switchPulse,
  toPulse,
} from './mapping'
import {
  type ButtonRow,
  DEFAULT_CALIBRATION,
  DEFAULT_RANGE,
  NOT_MINE,
  type Profile,
  type StickRow,
  type SwitchRow,
} from './types'

const STICK: StickRow = {
  kind: 'stick', channel: 1, axis: 0, invert: false, calibration: DEFAULT_CALIBRATION, deadZone: 0, expo: 0,
}
const SWITCH: SwitchRow = { kind: 'switch', channel: 5, axis: 5, invert: false, pulses: [1000, 1500, 2000] }
const BUTTON: ButtonRow = { kind: 'button', channel: 6, button: 2, off: 1000, on: 2000 }
const pad = (axes: number[], buttons: number[] = []) => ({ axes, buttons })

describe('an axis made a number from -1 to 1', () => {
  it('is 0 at rest and 1 or -1 at the ends it was calibrated at, whatever the ends are', () => {
    const cal = { min: -0.9, center: 0.1, max: 0.6 }

    expect(normalise(0.1, cal)).toBe(0)
    expect(normalise(0.6, cal)).toBe(1)
    expect(normalise(-0.9, cal)).toBe(-1)
    expect(normalise(0.35, cal)).toBeCloseTo(0.5)
    expect(normalise(-0.4, cal)).toBeCloseTo(-0.5)
  })

  it('does not go past 1 and -1, and is 0 for an axis that was never calibrated or a reading that is not a number', () => {
    expect(normalise(3, DEFAULT_CALIBRATION)).toBe(1)
    expect(normalise(-3, DEFAULT_CALIBRATION)).toBe(-1)
    expect(normalise(0.5, { min: 0, center: 0, max: 0 })).toBe(0)
    expect(normalise(Number.NaN, DEFAULT_CALIBRATION)).toBe(0)
  })
})

describe('the dead zone and the curve', () => {
  it('has nothing in the dead zone and the whole range outside it', () => {
    expect(applyDeadZone(0.05, 0.1)).toBe(0)
    expect(applyDeadZone(-0.1, 0.1)).toBe(0)
    expect(applyDeadZone(1, 0.1)).toBe(1)
    expect(applyDeadZone(-1, 0.1)).toBe(-1)
    expect(applyDeadZone(0.55, 0.1)).toBeCloseTo(0.5)
  })

  it('is a line with no expo, a cube with all of it, and the same at the ends and the middle', () => {
    expect(applyExpo(0.5, 0)).toBe(0.5)
    expect(applyExpo(0.5, 1)).toBeCloseTo(0.125)
    expect(applyExpo(1, 0.7)).toBeCloseTo(1)
    expect(applyExpo(-1, 0.7)).toBeCloseTo(-1)
    expect(applyExpo(0, 0.7)).toBe(0)
  })
})

describe('a value made the pulse of a channel', () => {
  it('is the minimum, the trim and the maximum of the vehicle at -1, 0 and 1, whatever they are', () => {
    const range = { min: 1100, trim: 1400, max: 1900 }

    expect(toPulse(-1, range)).toBe(1100)
    expect(toPulse(0, range)).toBe(1400)
    expect(toPulse(1, range)).toBe(1900)
    expect(toPulse(0.5, range)).toBe(1650)
    expect(toPulse(-0.5, range)).toBe(1250)
  })

  it('never goes outside what the backend takes', () => {
    expect(toPulse(1, { min: 500, trim: 1500, max: 3000 })).toBe(2200)
    expect(toPulse(-1, { min: 500, trim: 1500, max: 3000 })).toBe(800)
  })
})

describe('a stick', () => {
  it('goes to the ends of the channel and rests at its trim', () => {
    expect(stickPulse(STICK, pad([-1]), DEFAULT_RANGE)).toBe(1000)
    expect(stickPulse(STICK, pad([0]), DEFAULT_RANGE)).toBe(1500)
    expect(stickPulse(STICK, pad([1]), DEFAULT_RANGE)).toBe(2000)
  })

  it('is turned by inversion, also when its ends are not the same distance from its middle', () => {
    const lopsided: StickRow = { ...STICK, invert: true, calibration: { min: -0.5, center: 0, max: 1 } }

    expect(stickPulse({ ...STICK, invert: true }, pad([1]), DEFAULT_RANGE)).toBe(1000)
    expect(stickPulse(lopsided, pad([1]), DEFAULT_RANGE)).toBe(1000)
    expect(stickPulse(lopsided, pad([-0.5]), DEFAULT_RANGE)).toBe(2000)
  })

  it('has its dead zone and its expo', () => {
    const soft: StickRow = { ...STICK, deadZone: 0.1, expo: 1 }

    expect(stickPulse(soft, pad([0.05]), DEFAULT_RANGE)).toBe(1500)
    expect(stickPulse(soft, pad([0.55]), DEFAULT_RANGE)).toBe(1563)
  })

  it('is the radio\'s own for an axis the pad does not have', () => {
    expect(stickPulse({ ...STICK, axis: 9 }, pad([1]), DEFAULT_RANGE)).toBe(NOT_MINE)
  })
})

describe('a switch and a button', () => {
  it('give the pulse of the third of the travel the axis is in, and turn when inverted', () => {
    expect(switchPulse(SWITCH, pad([0, 0, 0, 0, 0, -1]))).toBe(1000)
    expect(switchPulse(SWITCH, pad([0, 0, 0, 0, 0, 0]))).toBe(1500)
    expect(switchPulse(SWITCH, pad([0, 0, 0, 0, 0, 1]))).toBe(2000)
    expect(switchPulse({ ...SWITCH, invert: true }, pad([0, 0, 0, 0, 0, 1]))).toBe(1000)
  })

  it('give the radio\'s own for what the pad does not have', () => {
    expect(switchPulse({ ...SWITCH, axis: 9 }, pad([0]))).toBe(NOT_MINE)
    expect(buttonPulse(BUTTON, pad([], [0, 0]))).toBe(NOT_MINE)
  })

  it('give the off pulse up and the on pulse pressed', () => {
    expect(buttonPulse(BUTTON, pad([], [0, 0, 0]))).toBe(1000)
    expect(buttonPulse(BUTTON, pad([], [0, 0, 1]))).toBe(2000)
  })
})

describe('the 16 channels of a profile', () => {
  const profile: Profile = { device: 'pad', rows: [STICK, { ...STICK, channel: 3, axis: 1 }, SWITCH, BUTTON] }
  const range = () => DEFAULT_RANGE

  it('are the pulses of the rows, and the radio\'s own for every channel no row drives', () => {
    const pulses = channelsOf(profile, pad([1, -1, 0, 0, 0, 1], [0, 0, 1]), range)

    expect(pulses).toHaveLength(16)
    expect(pulses.slice(0, 6)).toEqual([2000, NOT_MINE, 1000, NOT_MINE, 2000, 2000])
    expect(pulses.slice(6)).toEqual(Array.from({ length: 10 }, () => NOT_MINE))
  })

  it('take the range of each channel from the vehicle', () => {
    const short = { min: 1100, trim: 1500, max: 1900 }
    const pulses = channelsOf(profile, pad([1, 1, 0, 0, 0, 0], [0, 0, 0]), channel => (channel === 3 ? short : DEFAULT_RANGE))

    expect(pulses[0]).toBe(2000)
    expect(pulses[2]).toBe(1900)
  })
})
