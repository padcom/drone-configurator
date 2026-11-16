import { describe, expect, it } from 'vitest'
import { type Gate, START_GATE, guard, isLow } from './safety'
import { suggestedProfile } from './suggest'
import { ARM_FUNCTIONS, type Facts, type ParamValue, factsOf, vehicleChannels, vehicleProblems } from './vehicle'
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
  const values: [string, number][] = [['MIN', 1100], ['TRIM', 1500], ['MAX', 1900], ['DZ', 0], ['OPTION', 0]]

  for (let channel = 1; channel <= 16; channel += 1) {
    base.push(...values.map(([name, value]) => ({ id: `RC${channel}_${name}`, value })))
  }

  return [...base.filter(p => !extra.some(e => e.id === p.id)), ...extra]
}

/**
 * The facts of a whole parameter list.
 *
 * @param extra what to add or replace
 * @param without the names of parameters that are not there
 * @returns the facts
 */
function facts(extra: ParamValue[] = [], without: string[] = []): Facts {
  return factsOf(params(extra).filter(p => !without.includes(p.id)), true)!
}

describe('what the vehicle says of its channels', () => {
  it('is the map of the sticks, and the range of each channel, never assumed to be 1 to 4', () => {
    const said = facts([{ id: 'RCMAP_THROTTLE', value: 1 }, { id: 'RCMAP_ROLL', value: 3 }])

    expect(said.map).toEqual({ roll: 3, pitch: 2, throttle: 1, yaw: 4 })
    expect(said.ranges[0]).toEqual({ min: 1100, trim: 1500, max: 1900 })
    expect(said.zones[0]).toBe(0)
    expect(vehicleChannels(said).throttle).toBe(1)
    expect(vehicleChannels(said).range(5)).toEqual({ min: 1100, trim: 1500, max: 1900 })
  })

  it('is nothing when the vehicle did not say where its sticks are, or said a channel that is not one', () => {
    expect(factsOf([], true)).toBeNull()
    expect(factsOf(params([{ id: 'RCMAP_YAW', value: 17 }]), true)).toBeNull()
    expect(factsOf(params([{ id: 'RCMAP_YAW', value: 2.5 }]), true)).toBeNull()
  })
})

describe('what the vehicle says of a channel it did not say, and of the others', () => {
  it('is the default range for a channel it did not say (a switch), and the zone and the function of the others', () => {
    const said = facts([{ id: 'RC7_MIN', value: 0 }, { id: 'RC3_DZ', value: 30 }, { id: 'RC9_OPTION', value: 153 }])
    const noMax = facts([], ['RC8_MAX'])

    expect(said.ranges[6]).toEqual({ min: 0, trim: 1500, max: 1900 })
    expect(noMax.ranges[7]).toBeNull()
    expect(vehicleChannels(noMax).range(8)).toEqual(DEFAULT_RANGE)
    expect(vehicleChannels(said).throttleDeadZone).toBe(30)
    expect(said.options[8]).toBe(153)
  })

  it('does not read a value it was not told as 0: the zone and the function of a channel it did not say are undefined', () => {
    const said = facts([], ['RC3_DZ', 'RC5_OPTION'])

    expect(said.zones[2]).toBeUndefined()
    expect(said.options[4]).toBeUndefined()
    expect(said.zones[0]).toBe(0)
    expect(said.options[0]).toBe(0)
  })
})

describe('what is wrong with a mapping and the vehicle together', () => {
  const profile = suggestedProfile('pad', null)

  it('is a vehicle that is not known, and a stick channel whose range cannot be used, each stopping the control', () => {
    const broken = facts([{ id: 'RC3_MIN', value: 2000 }])
    const noTrim = facts([], ['RC2_TRIM'])

    expect(vehicleProblems(null, profile)).toEqual([{ code: 'unknown', channel: 0, blocks: true }])
    expect(vehicleProblems(broken, profile)).toEqual([{ code: 'range', channel: 3, blocks: true }])
    expect(vehicleProblems(noTrim, profile)).toEqual([{ code: 'range', channel: 2, blocks: true }])
  })

  it('is a parameter list that was not downloaded whole: nothing in it can be taken for what the vehicle says', () => {
    const partial = factsOf(params(), false)

    expect(vehicleProblems(partial, profile)).toEqual([{ code: 'unknown', channel: 0, blocks: true }])
  })

  it('is a value that is not there, never 0: the function of a channel a row drives, and the throttle\'s dead zone', () => {
    const noOption = facts([], ['RC1_OPTION', 'RC4_OPTION'])
    const noZone = facts([], ['RC3_DZ'])

    expect(vehicleProblems(noOption, profile)).toEqual([
      { code: 'unknown', channel: 1, blocks: true },
      { code: 'unknown', channel: 4, blocks: true },
    ])
    expect(vehicleProblems(noZone, profile)).toEqual([{ code: 'unknown', channel: 3, blocks: true }])
    // (a channel no row drives may lack its function: it is none of the mapping's business)
    expect(vehicleProblems(facts([], ['RC9_OPTION']), profile)).toEqual([])
  })
})

describe('what the vehicle says of the functions of its channels', () => {
  const profile = suggestedProfile('pad', null)

  it('is a row on a channel that arms, disarms or stops the motors, and no other function', () => {
    const aSwitch = { kind: 'switch' as const, channel: 5, axis: 5, invert: false, pulses: [1000, 1500, 2000] as const }
    const withArm = { ...profile, rows: [...profile.rows, aSwitch] }

    expect(ARM_FUNCTIONS).toEqual([31, 32, 81, 153, 154, 165])

    for (const option of ARM_FUNCTIONS) {
      expect(vehicleProblems(facts([{ id: 'RC5_OPTION', value: option }]), withArm)).toEqual([
        { code: 'arm', channel: 5, blocks: true },
      ])
    }
    expect(vehicleProblems(facts([{ id: 'RC5_OPTION', value: 17 }]), withArm)).toEqual([])
    // (a channel with an arm function that no row drives is none of the mapping's business)
    expect(vehicleProblems(facts([{ id: 'RC9_OPTION', value: 153 }]), withArm)).toEqual([])
  })

  it('is a warning, not a stop, when the throttle dead zone is wider than the plain "low"', () => {
    const wide = facts([{ id: 'RC3_DZ', value: 100 }])

    expect(vehicleProblems(wide, profile)).toEqual([{ code: 'zone', channel: 3, blocks: false }])
    expect(vehicleProblems(facts([{ id: 'RC3_DZ', value: 30 }]), profile)).toEqual([])
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
    const said = facts([{ id: 'RC3_DZ', value: 100 }])
    const channels = [1500, 1500, 1290, 1500, ...Array.from({ length: 12 }, () => NOT_MINE)]
    const read = (before: Gate): Gate => guard(channels, vehicleChannels(said), before).gate
    const gate = Array.from({ length: 5 }).reduce<Gate>(before => read(before), START_GATE)

    expect(gate.open).toBe(true)
  })
})
