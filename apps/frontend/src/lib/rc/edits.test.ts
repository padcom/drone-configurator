import { describe, expect, it } from 'vitest'
import { addRow, calibrated, changeRow, removeRow } from './edits'
import { problemsOf } from './profile'
import { newStick, suggestedProfile } from './suggest'
import type { Profile, Row, StickRow } from './types'

/**
 * A mapping that has been through the wizard.
 *
 * @returns the mapping
 */
function done(): Profile {
  return calibrated(suggestedProfile('pad', null), new Map([[0, { min: -1, center: 0, max: 1 }]]))
}

describe('a mapping that was calibrated', () => {
  it('is calibrated by the wizard, which gives the sticks of the axes it measured their calibrations', () => {
    const profile = done()

    expect(profile.calibrated).toBe(true)
    expect((profile.rows[0] as StickRow).calibration).toEqual({ min: -1, center: 0, max: 1 })
    expect(problemsOf(profile)).toEqual([])
  })

  it('is not calibrated any more after ANY change: a row added, taken away, or changed in any way', () => {
    const profile = done()
    const changes = [
      addRow(profile, newStick(9, 7)),
      removeRow(profile, 1),
      changeRow(profile, 0, { axis: 5 }),
      changeRow(profile, 0, { invert: true }),
      changeRow(profile, 0, { deadZone: 0.1 }),
      changeRow(profile, 0, { expo: 0.3 }),
      changeRow(profile, 0, { channel: 9 }),
      changeRow(profile, 0, { calibration: { min: -1, center: 0.1, max: 1 } }),
    ]

    expect(changes.map(change => change.calibrated)).toEqual(changes.map(() => false))
    expect(profile.calibrated).toBe(true)
  })
})

describe('a mapping that was changed', () => {
  it('does not change the rows it did not name, and keeps the kind of a row', () => {
    const profile = done()
    const kindChange: Partial<Row> = { kind: 'button' }
    const changed = changeRow(changeRow(profile, 1, { axis: 7 }), 1, kindChange)

    expect(changed.rows[0]).toBe(profile.rows[0])
    expect(changed.rows[1]?.kind).toBe('stick')
    expect((changed.rows[1] as StickRow).axis).toBe(7)
    expect(removeRow(profile, 0).rows).toHaveLength(3)
    expect(addRow(profile, newStick(9, 7)).rows).toHaveLength(5)
  })
})
