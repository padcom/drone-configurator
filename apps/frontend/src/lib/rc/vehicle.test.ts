import { describe, expect, it } from 'vitest'
import { type Gate, START_GATE, guard, isLow } from './safety'
import { suggestedProfile } from './suggest'
import { ARM_FUNCTIONS, type Facts, type ParamValue, factsOf, vehicleChannels, vehicleProblems } from './vehicle'
import { channelsOf, rangeOk } from './mapping'
import { DEFAULT_CALIBRATION, DEFAULT_RANGE, NOT_MINE, type Profile, type PulseRange, type StickRow } from './types'

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

const stick = (channel: number, axis: number): StickRow => ({
  kind: 'stick', channel, axis, invert: false, calibration: DEFAULT_CALIBRATION, deadZone: 0, expo: 0,
})
const PROFILE: Profile = { device: 'pad', calibrated: true, rows: [stick(1, 0), stick(2, 1), stick(3, 2), stick(4, 3)] }

/**
 * The pulse of channel 3 (the throttle) of a profile for a stick level, through the ranges the vehicle says.
 *
 * @param profile the mapping
 * @param level the throttle stick, -1 to 1 (any number)
 * @param said the vehicle's facts
 * @returns the pulse, or the radio's own
 */
function throttlePulse(profile: Profile, level: number, said: Facts): number {
  return channelsOf(profile, { axes: [0, 0, level, 0], buttons: [] }, vehicleChannels(said).range)[2] ?? NOT_MINE
}

/**
 * The pulses of channel 3 for stick levels -1, -0.5, 0, 0.5 and 1.
 *
 * @param said the vehicle's facts
 * @returns the five pulses
 */
function throttleTravel(said: Facts): number[] {
  return [-1, -0.5, 0, 0.5, 1].map(level => throttlePulse(PROFILE, level, said))
}

const ends = (min: number, trim: number, max: number): ParamValue[] => [
  { id: 'RC3_MIN', value: min }, { id: 'RC3_TRIM', value: trim }, { id: 'RC3_MAX', value: max },
]

describe('the throttle is a straight line from RCn_MIN to RCn_MAX, whatever RCn_TRIM says', () => {
  it('is the same with the trim in the middle (the SITL defaults: 1000, 1500, 2000), at the bottom and at the top', () => {
    const line = [1000, 1250, 1500, 1750, 2000]

    expect(throttleTravel(facts(ends(1000, 1500, 2000)))).toEqual(line)
    expect(throttleTravel(facts(ends(1000, 1000, 2000)))).toEqual(line)
    expect(throttleTravel(facts(ends(1000, 2000, 2000)))).toEqual(line)
    expect(throttleTravel(facts(ends(1000, 1337, 2000)))).toEqual(line)
  })

  it('goes from the vehicle\'s own minimum to its own maximum, whatever they are', () => {
    expect(throttleTravel(facts(ends(1100, 1100, 1900)))).toEqual([1100, 1300, 1500, 1700, 1900])
    expect(throttleTravel(facts(ends(1001, 1001, 1998)))).toEqual([1001, 1250, 1500, 1749, 1998])
  })
})

describe('the throttle for a vehicle whose range is not known or not usable', () => {
  const none = Array.from({ length: 5 }, () => NOT_MINE)

  it('is the default range (1000 to 2000, the middle in the middle) for a vehicle that did not say', () => {
    expect(throttleTravel(facts([], ['RC3_MIN']))).toEqual([1000, 1250, 1500, 1750, 2000])
    expect(rangeOk(vehicleChannels(facts(ends(1100, 1100, 1900))).range(3))).toBe(true)
  })

  it('is the radio\'s own for a range that is upside down or empty', () => {
    expect(throttleTravel(facts(ends(1900, 1500, 1100)))).toEqual(none)
    expect(throttleTravel(facts(ends(1500, 1500, 1500)))).toEqual(none)
  })
})

describe('the throttle can never go under the minimum, and a reading that is not a number is never sent', () => {
  const said = facts(ends(1100, 1100, 1900))
  const row: StickRow = { ...stick(3, 2), deadZone: 0.4, expo: 0.7 }
  const soft: Profile = { device: 'pad', calibrated: true, rows: [row] }

  it('stays within RCn_MIN and RCn_MAX, with a dead zone and an expo', () => {
    const pulses = [-1, -0.99, -0.3, 0, 0.3, 1].map(level => throttlePulse(soft, level, said))

    expect(pulses.every(pulse => pulse >= 1100 && pulse <= 1900)).toBe(true)
  })

  it('is the radio\'s own for a number that is not one', () => {
    expect(throttlePulse(soft, Number.NaN, said)).toBe(NOT_MINE)
    expect(throttlePulse(soft, Number.POSITIVE_INFINITY, said)).toBe(NOT_MINE)
  })
})

describe('the other sticks are not changed', () => {
  it('leaves roll, pitch and yaw on their trim, and the rudder hold on RCMAP_YAW', () => {
    const said = facts([...ends(1000, 1000, 2000), { id: 'RC1_TRIM', value: 1520 }, { id: 'RC4_TRIM', value: 1480 }])
    const { range } = vehicleChannels(said)

    expect([range(1), range(4)]).toEqual([{ min: 1100, trim: 1520, max: 1900 }, { min: 1100, trim: 1480, max: 1900 }])
    expect(range(3)).toEqual({ min: 1000, trim: 1500, max: 2000 })
    expect(vehicleChannels(said).yaw).toBe(4)
  })
})

/**
 * The gate after some reads of the throttle stick, through a vehicle whose RC3_TRIM is where it is said.
 *
 * @param level the throttle stick, -1 to 1
 * @param trim RC3_TRIM
 * @param reads how many reads in a row
 * @returns the gate
 */
function gateAfter(level: number, trim: number, reads: number): Gate {
  const channels = vehicleChannels(facts(ends(1000, trim, 2000)))
  const row = (): number[] => channelsOf(PROFILE, { axes: [0, 0, level, 0], buttons: [] }, channels.range)

  return Array.from({ length: reads }).reduce<Gate>(before => guard(row(), channels, before).gate, START_GATE)
}

/**
 * The facts of a vehicle whose throttle is on channel 5 (RCMAP_THROTTLE 5), with the trims of channels 3 and 5 as said.
 *
 * @param trim3 RC3_TRIM, a channel that is not the throttle here
 * @param trim5 RC5_TRIM, the throttle's
 * @returns the facts
 */
function throttleOnFive(trim3: number, trim5: number): Facts {
  const five: ParamValue[] = [
    { id: 'RC5_MIN', value: 1000 },
    { id: 'RC5_TRIM', value: trim5 },
    { id: 'RC5_MAX', value: 2000 },
  ]

  return facts([{ id: 'RCMAP_THROTTLE', value: 5 }, ...ends(1000, trim3, 2000), ...five])
}

const ON_FIVE: Profile = {
  device: 'pad',
  calibrated: true,
  rows: [stick(1, 0), stick(2, 1), stick(5, 2), stick(4, 3), stick(3, 4)],
}

/**
 * The pulse of a channel of the profile with the throttle on channel 5, the sticks of channels 5 and 3 both at `level`.
 *
 * @param channel the channel
 * @param level the stick
 * @param said the vehicle's facts
 * @returns the pulse
 */
function pulseOn(channel: number, level: number, said: Facts): number {
  const axes = [0, 0, level, 0, level]

  return channelsOf(ON_FIVE, { axes, buttons: [] }, vehicleChannels(said).range)[channel - 1] ?? NOT_MINE
}

describe('the throttle is the channel the vehicle says, not channel 3', () => {
  it('is a straight line on channel 5 with its trim at the minimum', () => {
    const said = throttleOnFive(1500, 1000)

    expect([-1, 0, 1].map(level => pulseOn(5, level, said))).toEqual([1000, 1500, 2000])
    expect([-0.5, 0.5].map(level => pulseOn(5, level, said))).toEqual([1250, 1750])
  })

  it('leaves channel 3, which is a plain channel now, on its own trim', () => {
    const said = throttleOnFive(1000, 1000)
    const { range } = vehicleChannels(said)

    expect(range(3)).toEqual({ min: 1000, trim: 1000, max: 2000 })
    expect(range(5)).toEqual({ min: 1000, trim: 1500, max: 2000 })
    // (channel 3 is a stick here, whose middle is its trim: 1000)
    expect([-1, 0, 1].map(level => pulseOn(3, level, said))).toEqual([1000, 1000, 2000])
  })

  it('has the gate follow the throttle on channel 5, not on channel 3', () => {
    const said = throttleOnFive(1000, 1000)
    const channels = vehicleChannels(said)
    const reads = (level: number): Gate => Array.from({ length: 20 }).reduce<Gate>(before => {
      const axes = [0, 0, level, 0, 0]

      return guard(channelsOf(ON_FIVE, { axes, buttons: [] }, channels.range), channels, before).gate
    }, START_GATE)

    expect(channels.throttle).toBe(5)
    expect(reads(0).open).toBe(false)
    expect(reads(-1).open).toBe(true)
  })
})

describe('the throttle gate still means the stick is at the bottom, whatever the trim', () => {
  it('does not open at the middle of the travel when the trim is at the minimum (the middle is 1500, not low)', () => {
    expect(gateAfter(0, 1000, 20).open).toBe(false)
    expect(gateAfter(-0.5, 1000, 20).open).toBe(false)
    expect(gateAfter(0, 1500, 20).open).toBe(false)
    expect(gateAfter(0, 2000, 20).open).toBe(false)
  })

  it('opens with the stick at the bottom, with the trim anywhere, after the usual reads in a row', () => {
    for (const trim of [1000, 1500, 2000]) {
      expect(gateAfter(-1, trim, 4).open).toBe(false)
      expect(gateAfter(-1, trim, 5).open).toBe(true)
    }
  })
})
