import { expect, it } from 'vitest'
import type { CalibrationCompass } from '@/generated/app'
import { ACCEL_POSITIONS, anySucceeded, foundTurned, litCount, litSections, moved, offsetParams, shown } from './calibration'

/**
 * A compass with a report.
 *
 * @param ok whether it worked
 * @param oldOrientation the orientation before
 * @param newOrientation the orientation after
 * @returns the compass
 */
function compass(ok: boolean, oldOrientation = 0, newOrientation = 0): CalibrationCompass {
  return {
    id: 0,
    status: ok ? 'SUCCESS' : 'FAILED',
    percent: 100,
    attempt: 1,
    mask: [],
    report: {
      ok, fitness: 1, offsets: [0, 0, 0], diagonals: [1, 1, 1], offDiagonals: [0, 0, 0],
      oldOrientation, newOrientation, orientationConfidence: 0, scale: 1, accepted: false,
    },
  }
}

it('has the six positions in the order the vehicle asks for them', () => {
  expect(ACCEL_POSITIONS.map(p => `${p.position}:${p.key}`))
    .toEqual(['1:level', '2:left', '3:right', '4:noseDown', '5:noseUp', '6:back'])
})

it('lights the sections the mask says, bit 0 of byte 0 first, 80 in all', () => {
  const lit = litSections([0b00000101, 0, 0, 0, 0, 0, 0, 0, 0, 0b10000000])

  expect(lit).toHaveLength(80)
  expect(lit.flatMap((on, i) => on ? [i] : [])).toEqual([0, 2, 79])
  expect(litCount([255, 255, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(16)
})

it('lights nothing the mask does not say: a short mask, or a byte that is no integer', () => {
  expect(litCount([])).toBe(0)
  expect(litCount([1])).toBe(1)
  expect(litCount([Number.NaN, 1.5, 3])).toBe(2)
})

it('names the offsets of each compass', () => {
  expect(offsetParams(0)).toEqual(['COMPASS_OFS_X', 'COMPASS_OFS_Y', 'COMPASS_OFS_Z'])
  expect(offsetParams(1)).toEqual(['COMPASS2_OFS_X', 'COMPASS2_OFS_Y', 'COMPASS2_OFS_Z'])
  expect(offsetParams(2)[2]).toBe('COMPASS3_OFS_Z')
})

it('moves a compass up or down by swapping it with its neighbour, and not past the ends', () => {
  expect(moved([10, 20, 30], 1, -1)).toEqual([20, 10, 30])
  expect(moved([10, 20, 30], 1, 1)).toEqual([10, 30, 20])
  expect(moved([10, 20, 30], 0, -1)).toBeNull()
  expect(moved([10, 20, 30], 2, 1)).toBeNull()
  expect(moved([10, 20, 30], 5, -1)).toBeNull()
})

it('sees a compass the vehicle found turned, and whether any compass succeeded', () => {
  expect(foundTurned(compass(true, 0, 0))).toBe(false)
  expect(foundTurned(compass(true, 0, 6))).toBe(true)
  expect(foundTurned({ ...compass(true), report: undefined })).toBe(false)
  expect(anySucceeded([compass(false), compass(true)])).toBe(true)
  expect(anySucceeded([compass(false)])).toBe(false)
  expect(anySucceeded([])).toBe(false)
})

it('shows a number with three decimals at most, and a number that is none as a dash', () => {
  expect(shown(12.5)).toBe('12.5')
  expect(shown(0.1234567)).toBe('0.123')
  expect(shown(Number.NaN)).toBe('—')
  expect(shown(Number.POSITIVE_INFINITY)).toBe('—')
})
