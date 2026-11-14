import { expect, it } from 'vitest'
import type { BatchSource } from '@/generated/app'
import { afterOf, stageOf } from './stage'

/**
 * A source of a log.
 *
 * @param sensor the sensor
 * @param instance its instance
 * @param postFilter after the filter (true), before it (false), or not known (undefined)
 * @returns the source
 */
function source(sensor: 'gyro' | 'accel', instance: number, postFilter?: boolean): BatchSource {
  const base = { sensor, instance, batches: 10, rateHz: 1000, samples: 1024, mixedRates: false }

  return postFilter === undefined ? base : { ...base, postFilter }
}

const PAIRED = [
  source('gyro', 0, false),
  source('gyro', 1, false),
  source('gyro', 3, true),
  source('gyro', 4, true),
  source('accel', 0, false),
]

it('tells a source as before the filter, after it, or not known', () => {
  expect(stageOf(source('gyro', 0, false))).toBe('before')
  expect(stageOf(source('gyro', 3, true))).toBe('after')
  expect(stageOf(source('gyro', 0))).toBe('unknown')
})

it('takes the source after the filter that is the same IMU: the instance plus the distance of the pairs', () => {
  expect(afterOf(PAIRED, source('gyro', 0, false))).toEqual({ state: 'pair', source: source('gyro', 3, true) })
  expect(afterOf(PAIRED, source('gyro', 1, false))).toEqual({ state: 'pair', source: source('gyro', 4, true) })
})

it('says that a source that is after the filter is that', () => {
  expect(afterOf(PAIRED, source('gyro', 3, true))).toEqual({ state: 'self' })
})

it('says why there is none: the log does not say, only data before the filter, the IMU\'s other half not logged', () => {
  expect(afterOf([source('gyro', 0), source('gyro', 1)], source('gyro', 0))).toEqual({ state: 'none', why: 'unknown' })
  // another sensor has none after the filter (the accelerometer here), and a log of only before
  expect(afterOf(PAIRED, source('accel', 0, false))).toEqual({ state: 'none', why: 'onlyBefore' })
  expect(afterOf([source('gyro', 0, false)], source('gyro', 0, false))).toEqual({ state: 'none', why: 'onlyBefore' })
  // IMU 2 is before the filter, and its half (5) is not there
  const odd = [...PAIRED, source('gyro', 2, false)]
  expect(afterOf(odd, source('gyro', 2, false))).toEqual({ state: 'none', why: 'noMatch' })
})
