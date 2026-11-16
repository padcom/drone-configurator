import { describe, expect, it } from 'vitest'
import { addRow, calibrated, changeRow, removeRow } from './edits'
import { problemsOf } from './profile'
import { newStick, suggestedProfile } from './suggest'
import type { AxisCalibration, Profile, Row, StickRow } from './types'
import { CALIBRATION, calibratedSuggestion } from '@/testing/rcProfiles'

/**
 * The calibrations of the axes of the suggested mapping, as the wizard would measure them.
 *
 * @param axes the axes
 * @param calibration what each is measured as
 * @returns the measurements
 */
function measured(axes: number[], calibration: AxisCalibration = CALIBRATION): Map<number, AxisCalibration> {
  return new Map(axes.map(axis => [axis, calibration]))
}

describe('a mapping that was calibrated', () => {
  it('is calibrated by the wizard, which gives the sticks of the axes it measured their calibrations', () => {
    const profile = calibrated(suggestedProfile('pad', null), measured([0, 1, 2, 3], { min: -0.9, center: 0.1, max: 0.95 }))

    expect(profile?.calibrated).toBe(true)
    expect((profile?.rows[0] as StickRow).calibration).toEqual({ min: -0.9, center: 0.1, max: 0.95 })
    expect(problemsOf(profile!)).toEqual([])
  })

  it('is not calibrated by a wizard that did not measure every stick: no mark, and no mapping', () => {
    const suggestion = suggestedProfile('pad', null)

    expect(calibrated(suggestion, new Map())).toBeNull()
    expect(calibrated(suggestion, measured([0, 1, 2]))).toBeNull()
    expect(calibrated(suggestion, measured([0, 1, 2, 3, 5]))).not.toBeNull()
    expect(calibrated({ ...suggestion, rows: [] }, measured([0, 1, 2, 3]))).toBeNull()
  })

  it('is not calibrated by a measurement that cannot scale an axis: ends not around the middle, or not numbers', () => {
    const suggestion = suggestedProfile('pad', null)
    const flat = { min: 0, center: 0, max: 1 }
    const nan = { min: -1, center: Number.NaN, max: 1 }
    const upside = { min: 1, center: 0, max: -1 }

    expect(calibrated(suggestion, measured([0, 1, 2, 3], flat))).toBeNull()
    expect(calibrated(suggestion, measured([0, 1, 2, 3], nan))).toBeNull()
    expect(calibrated(suggestion, measured([0, 1, 2, 3], upside))).toBeNull()
    expect(calibrated(suggestion, new Map([...measured([0, 1, 2]), [3, flat]]))).toBeNull()
  })
})

describe('a mapping that was changed', () => {
  it('is not calibrated any more after ANY change: a row added, taken away, or changed in any way', () => {
    const profile = calibratedSuggestion()
    const changes: Profile[] = [
      addRow(profile, newStick(9, 7)),
      removeRow(profile, 1),
      changeRow(profile, 0, { axis: 5 }),
      changeRow(profile, 0, { invert: true }),
      changeRow(profile, 0, { deadZone: 0.1 }),
      changeRow(profile, 0, { expo: 0.3 }),
      changeRow(profile, 0, { channel: 9 }),
      changeRow(profile, 0, { calibration: { min: -1, center: 0.1, max: 1 } }),
    ]

    expect(profile.calibrated).toBe(true)
    expect(changes.map(change => change.calibrated)).toEqual(changes.map(() => false))
  })

  it('does not change the rows it did not name, and keeps the kind of a row', () => {
    const profile = calibratedSuggestion()
    const kindChange: Partial<Row> = { kind: 'button' }
    const changed = changeRow(changeRow(profile, 1, { axis: 7 }), 1, kindChange)

    expect(changed.rows[0]).toBe(profile.rows[0])
    expect(changed.rows[1]?.kind).toBe('stick')
    expect((changed.rows[1] as StickRow).axis).toBe(7)
    expect(removeRow(profile, 0).rows).toHaveLength(3)
    expect(addRow(profile, newStick(9, 7)).rows).toHaveLength(5)
  })
})
