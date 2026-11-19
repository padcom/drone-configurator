// The rest check: which of the four sticks is not at rest.
import { describe, expect, it } from 'vitest'
import { REST_BAND, levelText, notAtRest } from './rest'
import { suggestedProfile } from './suggest'
import type { Profile } from './types'
import { sample } from '@/testing/rcSamples'

const STICKS = { roll: 1, pitch: 2, throttle: 3, yaw: 4 }

const centred: Profile = suggestedProfile('pad', null)
const low: Profile = { ...centred, throttleStyle: 'low' }

describe('the sticks at rest, with a centred throttle', () => {
  it('are all four of them in the middle: roll, pitch and yaw within the band, the throttle in its dead zone', () => {
    expect(notAtRest(centred, sample(0, 0, 0, 0), STICKS, false)).toEqual([])
    expect(notAtRest(centred, sample(REST_BAND, -REST_BAND, 0.05, REST_BAND), STICKS, false)).toEqual([])
  })

  it('name every stick that is not, in the order roll, pitch, throttle, yaw, with what it reads', () => {
    const found = notAtRest(centred, sample(0.72, -0.2, 0.5, 0.9), STICKS, false)

    expect(found.map(f => [f.stick, f.level])).toEqual([['roll', 0.72], ['pitch', -0.2], ['throttle', 0.5], ['yaw', 0.9]])
  })

  it('does not take a throttle at the bottom for rest, however low it is', () => {
    expect(notAtRest(centred, sample(0, 0, -1, 0), STICKS, true).map(f => f.stick)).toEqual(['throttle'])
  })

  it('takes a throttle that is outside its row\'s dead zone for not at rest', () => {
    expect(notAtRest(centred, sample(0, 0, 0.09, 0), STICKS, false).map(f => f.stick)).toEqual(['throttle'])
  })
})

describe('the sticks at rest, with a throttle that rests low', () => {
  it('want the throttle low (as the vehicle reads it), and do not mind where in its travel the middle is', () => {
    expect(notAtRest(low, sample(0, 0, -1, 0), STICKS, true)).toEqual([])
    expect(notAtRest(low, sample(0, 0, 0, 0), STICKS, false).map(f => f.stick)).toEqual(['throttle'])
  })

  it('catch a trigger that rests at -1 as the roll, and a yaw that is held', () => {
    expect(notAtRest(low, sample(-1, 0, -1, 0.3), STICKS, true).map(f => f.stick)).toEqual(['roll', 'yaw'])
  })
})

describe('a stick the mapping or the pad does not give', () => {
  it('is not at rest, with no reading: a stick with no row, a row on a channel the pad has not', () => {
    const noYaw: Profile = { ...centred, rows: centred.rows.filter(row => row.channel !== 4) }

    expect(notAtRest(noYaw, sample(0, 0, 0, 0), STICKS, false)).toEqual([{ stick: 'yaw', level: null }])
    expect(notAtRest(centred, sample(0, 0, 0, null), STICKS, false)).toEqual([{ stick: 'yaw', level: null }])
  })

  it('reads a row\'s own inversion', () => {
    const inverted: Profile = { ...centred, rows: centred.rows.map(row => ({ ...row, invert: row.channel === 1 })) }

    expect(notAtRest(inverted, sample(0.5, 0, 0, 0), STICKS, false)).toEqual([{ stick: 'roll', level: -0.5 }])
  })
})

describe('the words of a reading', () => {
  it('is signed with two decimals, or a dash', () => {
    expect([0.724, -0.5, 0, null].map(levelText)).toEqual(['+0.72', '-0.50', '+0.00', '—'])
  })
})
