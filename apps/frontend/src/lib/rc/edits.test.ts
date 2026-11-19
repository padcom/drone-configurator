// Changing a mapping takes the confirmation away, every time.
import { describe, expect, it } from 'vitest'
import { confirmed } from './confirm'
import { addRow, changeRow, removeRow, setThrottleStyle } from './edits'
import { newRow, suggestedProfile } from './suggest'
import type { PadLayout, Profile } from './types'

const LAYOUT: PadLayout = Array.from({ length: 16 }, () => 'axis' as const)

/**
 * A mapping the person has confirmed.
 *
 * @returns the mapping
 */
function sure(): Profile {
  return confirmed(suggestedProfile('pad', null), LAYOUT)
}

describe('a mapping that was changed', () => {
  it('is confirmed only by the confirmation itself', () => {
    expect(suggestedProfile('pad', null).confirmedKey).toBeNull()
    expect(sure().confirmedKey).not.toBeNull()
  })

  it('is not confirmed any more after ANY change: a row added, taken away or changed in any way, or the throttle style', () => {
    const changed = [
      addRow(sure(), newRow(5, 5)),
      removeRow(sure(), 0),
      changeRow(sure(), 0, { invert: true }),
      changeRow(sure(), 1, { deadZone: 0.2 }),
      changeRow(sure(), 2, { expo: 0.3 }),
      changeRow(sure(), 3, { source: 7 }),
      changeRow(sure(), 3, { channel: 9 }),
      changeRow(sure(), 3, { pulseMin: 1000, pulseMax: 2000 }),
      setThrottleStyle(sure(), 'low'),
    ]

    expect(changed.map(profile => profile.confirmedKey)).toEqual(changed.map(() => null))
  })
})

describe('what a change leaves as it was', () => {
  it('does not change the rows it did not name', () => {
    const before = sure()
    const after = changeRow(before, 1, { invert: true })

    expect(after.rows[0]).toEqual(before.rows[0])
    expect(after.rows[1]).toEqual({ ...before.rows[1], invert: true })
    expect(before.confirmedKey).not.toBeNull()
    expect(removeRow(before, 0).rows.length).toBe(3)
  })

  it('has the throttle style it was given, and the rest as it was', () => {
    const before = sure()
    const after = setThrottleStyle(before, 'low')

    expect(after.throttleStyle).toBe('low')
    expect(after.rows).toBe(before.rows)
    expect(after.device).toBe(before.device)
  })
})
