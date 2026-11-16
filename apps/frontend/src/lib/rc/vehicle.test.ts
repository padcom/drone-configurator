import { describe, expect, it } from 'vitest'
import { type Gate, START_GATE, guard, isLow } from './safety'
import { suggestedProfile } from './suggest'
import { ARM_FUNCTIONS, type ParamValue, factsOf, vehicleChannels, vehicleProblems } from './vehicle'
import { DEFAULT_RANGE, NOT_MINE, type PulseRange } from './types'

/**
 * The parameters of a vehicle with the sticks on channels 1 to 4 and a range, a dead zone and a function for each channel.
 *
 * @param extra what to add or replace
 * @returns the parameters
 */
function params(extra: ParamValue[] = []): ParamValue[] {
  const sticks = ['ROLL', 'PITCH', 'THROTTLE', 'YAW']
  const base: ParamValue[] = sticks.map((name, index) => ({ id: `RCMAP_${name}`, value: index + 1 }))
  for (let channel = 1; channel <= 16; channel += 1) {
    base.push({ id: `RC${channel}_MIN`, value: 1100 }, { id: `RC${channel}_TRIM`, value: 1500 })
    base.push({ id: `RC${channel}_MAX`, value: 1900 })
  }

  return [...base.filter(p => !extra.some(e => e.id === p.id)), ...extra]
}

describe('what the vehicle says of its channels', () => {
  it('is the map of the sticks, and the range of each channel, never assumed to be 1 to 4', () => {
    const facts = factsOf(params([{ id: 'RCMAP_THROTTLE', value: 1 }, { id: 'RCMAP_ROLL', value: 3 }]))

    expect(facts?.map).toEqual({ roll: 3, pitch: 2, throttle: 1, yaw: 4 })
    expect(facts?.ranges[0]).toEqual({ min: 1100, trim: 1500, max: 1900 })
    expect(facts?.zones[0]).toBe(0)
    expect(vehicleChannels(facts!).throttle).toBe(1)
    expect(vehicleChannels(facts!).range(5)).toEqual({ min: 1100, trim: 1500, max: 1900 })
  })

  it('is nothing when the vehicle did not say where its sticks are, or said a channel that is not one', () => {
    expect(factsOf([])).toBeNull()
    expect(factsOf(params([{ id: 'RCMAP_YAW', value: 17 }]))).toBeNull()
    expect(factsOf(params([{ id: 'RCMAP_YAW', value: 2.5 }]))).toBeNull()
  })
})

describe('what the vehicle says of a channel it did not say, and of the others', () => {
  it('is the default range for a channel it did not say (a switch), and the zone and the function of the others', () => {
    const facts = factsOf(params([{ id: 'RC7_MIN', value: 0 }, { id: 'RC3_DZ', value: 30 }, { id: 'RC9_OPTION', value: 153 }]))

    expect(facts?.ranges[6]).toEqual({ min: 0, trim: 1500, max: 1900 })
    expect(factsOf(params().filter(p => p.id !== 'RC8_MAX'))?.ranges[7]).toBeNull()
    expect(vehicleChannels(factsOf(params().filter(p => p.id !== 'RC8_MAX'))!).range(8)).toEqual(DEFAULT_RANGE)
    expect(vehicleChannels(facts!).throttleDeadZone).toBe(30)
    expect(facts?.options[8]).toBe(153)
  })
})

describe('what is wrong with a mapping and the vehicle together', () => {
  const profile = suggestedProfile('pad', null)

  it('is a vehicle that is not known, and a stick channel whose range cannot be used, each stopping the control', () => {
    expect(vehicleProblems(null, profile)).toEqual([{ code: 'unknown', channel: 0, blocks: true }])
    const broken = factsOf(params([{ id: 'RC3_MIN', value: 2000 }]))!

    const noTrim = factsOf(params().filter(p => p.id !== 'RC2_TRIM'))!

    expect(vehicleProblems(broken, profile)).toEqual([{ code: 'range', channel: 3, blocks: true }])
    expect(vehicleProblems(noTrim, profile)).toEqual([{ code: 'range', channel: 2, blocks: true }])
  })
})

describe('what the vehicle says of the functions of its channels', () => {
  const profile = suggestedProfile('pad', null)

  it('is a row on a channel that arms, disarms or stops the motors, and no other function', () => {
    expect(ARM_FUNCTIONS).toEqual([31, 32, 81, 153, 154, 165])
    const aSwitch = { kind: 'switch' as const, channel: 5, axis: 5, invert: false, pulses: [1000, 1500, 2000] as const }
    const withArm = { ...profile, rows: [...profile.rows, aSwitch] }

    for (const option of ARM_FUNCTIONS) {
      const facts = factsOf(params([{ id: 'RC5_OPTION', value: option }]))!

      expect(vehicleProblems(facts, withArm)).toEqual([{ code: 'arm', channel: 5, blocks: true }])
    }
    expect(vehicleProblems(factsOf(params([{ id: 'RC5_OPTION', value: 17 }]))!, withArm)).toEqual([])
    // (a channel with an arm function that no row drives is none of the mapping's business)
    expect(vehicleProblems(factsOf(params([{ id: 'RC9_OPTION', value: 153 }]))!, withArm)).toEqual([])
  })

  it('is a warning, not a stop, when the throttle dead zone is wider than the plain "low"', () => {
    const wide = factsOf(params([{ id: 'RC3_DZ', value: 100 }]))!

    expect(vehicleProblems(wide, profile)).toEqual([{ code: 'zone', channel: 3, blocks: false }])
    expect(vehicleProblems(factsOf(params([{ id: 'RC3_DZ', value: 30 }]))!, profile)).toEqual([])
  })
})

describe('"low" for the throttle gate with a dead zone', () => {
  const range: PulseRange = { min: 1100, trim: 1500, max: 1900 }

  it('is at least twice the dead zone above the minimum', () => {
    expect(isLow(1180, range)).toBe(true)
    expect(isLow(1181, range)).toBe(false)
    expect(isLow(1190, range)).toBe(false)
    expect(isLow(1190, range, 80)).toBe(true)
    expect(isLow(1260, range, 80)).toBe(true)
    expect(isLow(1261, range, 80)).toBe(false)
    expect(isLow(NOT_MINE, range, 80)).toBe(true)
  })

  it('is used by the guard: a stick the vehicle still reads as low opens the gate', () => {
    const facts = factsOf(params([{ id: 'RC3_DZ', value: 100 }]))!
    const channels = [1500, 1500, 1290, 1500, ...Array.from({ length: 12 }, () => NOT_MINE)]
    const read = (before: Gate): Gate => guard(channels, vehicleChannels(facts), before).gate
    const gate = Array.from({ length: 5 }).reduce<Gate>(before => read(before), START_GATE)

    expect(gate.open).toBe(true)
  })
})
