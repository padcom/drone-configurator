import { describe, expect, it } from 'vitest'
import { problemsOf } from './profile'
import { DEFAULT_CALIBRATION, type ButtonRow, type Profile, type StickRow, type SwitchRow } from './types'

const STICK: StickRow = {
  kind: 'stick', channel: 1, axis: 0, invert: false, calibration: DEFAULT_CALIBRATION, deadZone: 0.08, expo: 0.2,
}
const SWITCH: SwitchRow = { kind: 'switch', channel: 5, axis: 5, invert: false, pulses: [1000, 1500, 2000] }
const BUTTON: ButtonRow = { kind: 'button', channel: 6, button: 2, off: 1000, on: 2000 }
const profile = (...rows: Profile['rows']): Profile => ({ device: 'pad', rows, calibrated: true })

describe('a mapping that may drive a vehicle', () => {
  it('has no problem: one row for each channel, a stick that was calibrated, pulses that an override carries', () => {
    expect(problemsOf(profile(STICK, SWITCH, BUTTON))).toEqual([])
    expect(problemsOf(profile())).toEqual([])
  })

  it('has been through the calibration wizard: a mapping of defaults, or a suggestion, may not drive a vehicle', () => {
    const suggestion: Profile = { device: 'pad', rows: [STICK, SWITCH], calibrated: false }

    expect(problemsOf(suggestion)).toEqual([{ code: 'uncalibrated', channel: 0 }])
    expect(problemsOf({ ...suggestion, rows: [] })).toEqual([{ code: 'uncalibrated', channel: 0 }])
    expect(problemsOf({ ...suggestion, calibrated: true })).toEqual([])
  })
})

describe('the rows of a mapping', () => {
  it('has no channel outside 1 to 16 and no two rows for one channel', () => {
    expect(problemsOf(profile({ ...STICK, channel: 0 }, { ...STICK, channel: 17 }, { ...STICK, channel: 1.5 }))).toEqual([
      { code: 'channel', channel: 0 },
      { code: 'channel', channel: 17 },
      { code: 'channel', channel: 1.5 },
    ])
    expect(problemsOf(profile(STICK, { ...SWITCH, channel: 1 }))).toEqual([{ code: 'duplicate', channel: 1 }])
  })

  it('has a dead zone of 0 to 0.5, an expo of 0 to 1, and a stick whose ends are apart from its middle', () => {
    expect(problemsOf(profile({ ...STICK, deadZone: 0.6 }))).toEqual([{ code: 'zone', channel: 1 }])
    expect(problemsOf(profile({ ...STICK, deadZone: Number.NaN }))).toEqual([{ code: 'zone', channel: 1 }])
    expect(problemsOf(profile({ ...STICK, expo: 1.2 }))).toEqual([{ code: 'expo', channel: 1 }])
    const flat = { min: 0, center: 0, max: 1 }

    expect(problemsOf(profile({ ...STICK, calibration: flat }))).toEqual([{ code: 'calibration', channel: 1 }])
    const endless = { min: -1, center: 0, max: Infinity }

    expect(problemsOf(profile({ ...STICK, calibration: endless }))).toEqual([{ code: 'calibration', channel: 1 }])
  })

  it('has only pulses of 800 to 2200 µs, whole, on a switch or a button', () => {
    expect(problemsOf(profile({ ...SWITCH, pulses: [1000, 1500, 2300] }))).toEqual([{ code: 'pulse', channel: 5 }])
    expect(problemsOf(profile({ ...BUTTON, off: 0 }))).toEqual([{ code: 'pulse', channel: 6 }])
    expect(problemsOf(profile({ ...BUTTON, on: 1500.5 }))).toEqual([{ code: 'pulse', channel: 6 }])
  })
})
