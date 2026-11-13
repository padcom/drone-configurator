import { expect, it } from 'vitest'
import type { CalibrationRadio } from '@/generated/app'
import { RADIO_PARAMS, fractionOf, moved, offCentre, paramsOf, plannedWrites, roleOf } from './radio'

/** A capture of 4 channels: roll moved, pitch moved, throttle moved, yaw only a little. */
const CAPTURE: CalibrationRadio = {
  mins: [1008, 1011, 1004, 1480],
  maxs: [2011, 2002, 1996, 1530],
  last: [1507, 1500, 1004, 1495],
  glitches: 2,
  readings: 120,
}

const everything = () => true

it('names the parameters of a channel, and lists all of them for the page', () => {
  expect(paramsOf(7)).toEqual({ min: 'RC7_MIN', max: 'RC7_MAX', trim: 'RC7_TRIM', option: 'RC7_OPTION' })
  expect(RADIO_PARAMS).toHaveLength(64)
  expect(RADIO_PARAMS.slice(0, 4)).toEqual(['RC1_MIN', 'RC1_MAX', 'RC1_TRIM', 'RC1_OPTION'])
})

it('finds the role of a channel from the stick mapping, aux for the rest', () => {
  expect([1, 2, 3, 4, 5].map(n => roleOf(n, [null, null, null, null]))).toEqual(['roll', 'pitch', 'throttle', 'yaw', 'aux'])
  // a transmitter with the throttle on channel 1 and the roll on channel 3
  expect([1, 2, 3, 4].map(n => roleOf(n, [3, 2, 1, 4]))).toEqual(['throttle', 'pitch', 'roll', 'yaw'])
})

it('places a pulse in a range, and gives nothing for no pulse or no range', () => {
  expect(fractionOf(1500, 1000, 2000)).toBe(0.5)
  expect(fractionOf(900, 1000, 2000)).toBe(0)
  expect(fractionOf(2100, 1000, 2000)).toBe(1)
  expect(fractionOf(0, 1000, 2000)).toBe(0)
  expect(fractionOf(1500, 1500, 1500)).toBe(0)
})

it('takes a channel as moved when both ends were seen and the range is wide', () => {
  expect([0, 1, 2, 3].map(i => moved(CAPTURE, i))).toEqual([true, true, true, false])
  expect(moved(CAPTURE, 9)).toBe(false)
  // a range with a glitch in it is not a range
  expect(moved({ ...CAPTURE, maxs: [2500, 0, 0, 0] }, 0)).toBe(false)
})

it('writes the range of the channels that moved, and the trim of roll, pitch and yaw that sit inside it', () => {
  const planned = plannedWrites(CAPTURE, everything)
  expect(planned.map(p => `${p.id}=${p.value}`)).toEqual([
    'RC1_MIN=1008',
    'RC1_MAX=2011',
    'RC1_TRIM=1507',
    'RC2_MIN=1011',
    'RC2_MAX=2002',
    'RC2_TRIM=1500',
    // the throttle has no trim; the yaw barely moved, so nothing is written for it
    'RC3_MIN=1004',
    'RC3_MAX=1996',
  ])
})

it('chooses no trim for a stick that was at an end when the user pressed Done, and names the channels that have none', () => {
  // roll was left at its top (1900), pitch is centred (1500 of 1011 to 2002), yaw did not move
  const atAnEnd = { ...CAPTURE, last: [2011, 1500, 1004, 1495] }
  const ids = plannedWrites(atAnEnd, everything).map(p => p.id)

  expect(ids).not.toContain('RC1_TRIM')
  expect(ids).toContain('RC2_TRIM')
  expect(offCentre(atAnEnd)).toEqual([1])
  expect(offCentre(CAPTURE)).toEqual([])
})

it('takes a stick as centred within a tenth of the range from the middle, and no further', () => {
  // roll was seen from 1000 to 2000: the middle is 1500, and a tenth of 1000 is 100
  const range = { ...CAPTURE, mins: [1000, 1000, 1000, 1000], maxs: [2000, 2000, 2000, 2000] }
  const trimAt = (last: number) => {
    const planned = plannedWrites({ ...range, last: [last, 1500, 1000, 1500] }, everything)

    return planned.some(p => p.id === 'RC1_TRIM')
  }

  expect([1400, 1500, 1600].map(trimAt)).toEqual([true, true, true])
  expect([1399, 1601, 1900].map(trimAt)).toEqual([false, false, false])
})

it('writes no trim for a stick outside its range when the user ended, and nothing to a parameter the vehicle lacks', () => {
  const planned = plannedWrites({ ...CAPTURE, last: [1507, 2500, 1004, 1495] }, id => id !== 'RC1_MAX')
  expect(planned.map(p => p.id)).toEqual(['RC1_MIN', 'RC1_TRIM', 'RC2_MIN', 'RC2_MAX', 'RC3_MIN', 'RC3_MAX'])
})
