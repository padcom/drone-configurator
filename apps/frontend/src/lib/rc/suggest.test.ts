// The mapping offered for a device that has none.
import { describe, expect, it } from 'vitest'
import { DEFAULT_DEAD_ZONE, freeChannel, newRow, suggestedProfile } from './suggest'
import { factsOf } from './vehicle'

describe('the suggested mapping', () => {
  it('is the four sticks on the first four pad channels, on the vehicle\'s, with a centred throttle, and not confirmed', () => {
    const profile = suggestedProfile('pad', null)

    expect(profile.rows.map(row => [row.channel, row.source, row.deadZone])).toEqual([
      [1, 1, DEFAULT_DEAD_ZONE],
      [2, 2, DEFAULT_DEAD_ZONE],
      [3, 3, DEFAULT_DEAD_ZONE],
      [4, 4, DEFAULT_DEAD_ZONE],
    ])
    expect(profile.throttleStyle).toBe('centred')
    expect(profile.confirmedKey).toBeNull()
  })

  it('follows RCMAP_*: the sticks go to the channels the vehicle says', () => {
    const facts = factsOf([
      { id: 'RCMAP_ROLL', value: 2 },
      { id: 'RCMAP_PITCH', value: 3 },
      { id: 'RCMAP_THROTTLE', value: 1 },
      { id: 'RCMAP_YAW', value: 4 },
    ], true)

    expect(suggestedProfile('pad', facts).rows.map(row => [row.channel, row.source])).toEqual([[2, 1], [3, 2], [1, 3], [4, 4]])
  })

  it('has rows with no source for a new row: it follows nothing until the person moves the control they mean', () => {
    expect(newRow(7, 0)).toEqual({ channel: 7, source: 0, invert: false, deadZone: 0, expo: 0 })
    expect(newRow(7, 5, true).deadZone).toBe(DEFAULT_DEAD_ZONE)
  })
})

describe('the free channel', () => {
  it('is the lowest after the sticks\' that no row drives and the vehicle does not use to arm or stop', () => {
    const profile = suggestedProfile('pad', null)
    const sticks = ['ROLL', 'PITCH', 'THROTTLE', 'YAW'].map((name, index) => ({ id: `RCMAP_${name}`, value: index + 1 }))
    const facts = factsOf([...sticks, { id: 'RC5_OPTION', value: 153 }], true)

    expect(freeChannel(profile, null)).toBe(5)
    expect(freeChannel(profile, facts)).toBe(6)
  })
})
