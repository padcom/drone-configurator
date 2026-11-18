// "Move it": the pad channel the person moved.
import { describe, expect, it } from 'vitest'
import { MOVED_BY, movedControl } from './source'
import { sample } from '@/testing/rcSamples'

describe('the pad channel that was moved', () => {
  it('is the first that moved by at least MOVED_BY from where it was, as a 1-based channel', () => {
    expect(movedControl(sample(0, 0, 0), sample(0, MOVED_BY, 1))).toBe(2)
    expect(movedControl(sample(0, 0, 0), sample(0, MOVED_BY - 0.01, 0.2))).toBeNull()
    expect(movedControl(sample(-1, 0.5), sample(-1, -0.5))).toBe(2)
  })

  it('finds a button like a stick: it goes from -1 to 1', () => {
    expect(movedControl(sample(0, 0, 0, -1), sample(0, 0, 0, 1))).toBe(4)
  })

  it('does not take a channel the pad has not for a move, nor one that appeared or went', () => {
    expect(movedControl(sample(0, null), sample(0, null))).toBeNull()
    expect(movedControl(sample(0, null), sample(0, 1))).toBeNull()
    expect(movedControl(sample(0, 1), sample(0, null))).toBeNull()
  })
})
