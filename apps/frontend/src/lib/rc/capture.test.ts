import { describe, expect, it } from 'vitest'
import { Capture, MIN_REST_READS, MIN_TRAVEL } from './capture'
import { suggestedProfile } from './suggest'

/**
 * A capture of the sticks at rest, and then moved to their ends.
 *
 * @param rest what the axes say at rest
 * @param ends the two ends each axis is moved to, by axis (an axis not here is not moved)
 * @returns the capture
 */
function captured(rest: number[], ends: Record<number, [number, number]>): Capture {
  const capture = new Capture()

  for (let read = 0; read < MIN_REST_READS; read += 1) {
    capture.rest({ axes: rest, buttons: [] })
  }

  for (const [axis, [low, high]] of Object.entries(ends)) {
    const axes = [...rest]
    axes[Number(axis)] = low
    capture.move({ axes, buttons: [] })
    axes[Number(axis)] = high
    capture.move({ axes, buttons: [] })
  }

  return capture
}

describe('what the wizard measures of an axis', () => {
  it('is its ends and where it rests: the middle is the rest of a stick that springs back', () => {
    const capture = captured([0.02, 0, 0, 0], { 0: [-0.97, 0.99] })

    expect(capture.calibrationOf(0)).toEqual({ min: -0.97, center: expect.closeTo(0.02, 5), max: 0.99 })
    expect(capture.travel(0)).toBeCloseTo(1.96)
  })

  it('is the middle of the travel for a stick that rests at an end (a throttle), not its rest', () => {
    const capture = captured([0, 0, -1, 0], { 2: [-1, 1] })

    expect(capture.calibrationOf(2)).toEqual({ min: -1, center: 0, max: 1 })
  })

  it('is nothing for an axis that was not moved to both ends, or without enough reads at rest', () => {
    const capture = captured([0, 0, 0, 0], { 0: [-0.2, 0.3] })

    expect(capture.travel(0)).toBeLessThan(MIN_TRAVEL)
    expect(capture.calibrationOf(0)).toBeNull()
    expect(capture.calibrationOf(1)).toBeNull()
    expect(capture.calibrationOf(9)).toBeNull()
    expect(captured([0], { 0: [-1, 1] }).calibrationOf(0)).not.toBeNull()
    const few = new Capture()
    few.rest({ axes: [0], buttons: [] })
    few.move({ axes: [-1], buttons: [] })
    few.move({ axes: [1], buttons: [] })

    expect(few.restReads()).toBe(1)
    expect(few.calibrationOf(0)).toBeNull()
  })
})

describe('what the wizard measures for a mapping', () => {
  const profile = suggestedProfile('pad', null)

  it('is the calibration of each stick\'s axis, and the axes that failed', () => {
    const capture = captured([0, 0, -1, 0], { 0: [-1, 1], 1: [-1, 1], 2: [-1, 1] })
    const { calibrations, failed } = capture.measure(profile)

    expect([...calibrations.keys()]).toEqual([0, 1, 2])
    expect(failed).toEqual([3])
  })

  it('has nothing failed when every stick of the mapping was moved', () => {
    const capture = captured([0, 0, -1, 0], { 0: [-1, 1], 1: [-1, 1], 2: [-1, 1], 3: [-1, 1] })

    expect(capture.measure(profile).failed).toEqual([])
    expect(capture.measure({ ...profile, rows: [] }).calibrations.size).toBe(0)
  })
})
