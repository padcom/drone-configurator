import { describe, expect, it } from 'vitest'
import { MOVED_BY, movedControl } from './source'

const REST = { axes: [0, 0, -1, 0], buttons: [0, 0, 0] }

describe('what the person moved', () => {
  it('is the axis that went at least half of its travel from where it was, for a stick or a switch', () => {
    expect(movedControl('stick', REST, { axes: [0, 0.1, -1, 0], buttons: [0, 0, 0] })).toBeNull()
    expect(movedControl('stick', REST, { axes: [0, MOVED_BY, -1, 0], buttons: [0, 0, 0] })).toBe(1)
    expect(movedControl('switch', REST, { axes: [0, 0, -1, -0.9], buttons: [0, 0, 0] })).toBe(3)
    expect(movedControl('stick', REST, { axes: [0, 0, 0, 0], buttons: [0, 0, 0] })).toBe(2)
  })

  it('is measured from the baseline, not from the middle: a throttle that rests at the bottom is not "moved"', () => {
    expect(movedControl('stick', REST, { axes: [0, 0, -1, 0], buttons: [0, 0, 0] })).toBeNull()
  })

  it('is the first one when several went, and a button only for a button', () => {
    expect(movedControl('stick', REST, { axes: [1, 1, -1, 0], buttons: [1, 0, 0] })).toBe(0)
    expect(movedControl('button', REST, { axes: [1, 1, -1, 0], buttons: [0, 0, 0] })).toBeNull()
    expect(movedControl('button', REST, { axes: [0, 0, -1, 0], buttons: [0, 0, 1] })).toBe(2)
    expect(movedControl('stick', REST, { axes: [0, 0, -1, 0], buttons: [1, 1, 1] })).toBeNull()
  })

  it('does not take a value that is not a number for a move, and counts a control the baseline did not have from 0', () => {
    expect(movedControl('stick', REST, { axes: [Number.NaN, 0, -1, 0], buttons: [] })).toBeNull()
    expect(movedControl('stick', { axes: [], buttons: [] }, { axes: [0.2, 0.9], buttons: [] })).toBe(1)
  })
})
