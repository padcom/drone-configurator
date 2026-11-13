import { expect, it } from 'vitest'
import type { CalibrationRadio } from '@/generated/app'
import { RADIO_PARAMS, fractionOf, moved, paramsOf, plannedWrites, roleOf } from './radio'

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

it('writes no trim for a stick outside its range when the user ended, and nothing to a parameter the vehicle lacks', () => {
  const planned = plannedWrites({ ...CAPTURE, last: [1507, 2500, 1004, 1495] }, id => id !== 'RC1_MAX')
  expect(planned.map(p => p.id)).toEqual(['RC1_MIN', 'RC1_TRIM', 'RC2_MIN', 'RC2_MAX', 'RC3_MIN', 'RC3_MAX'])
})
