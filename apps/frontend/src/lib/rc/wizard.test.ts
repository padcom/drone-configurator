import { describe, expect, it } from 'vitest'
import { MIN_REST_READS } from './capture'
import { suggestedProfile } from './suggest'
import { type Failure, Wizard } from './wizard'
import type { PadSample, Profile } from './types'

const REST: PadSample = { axes: [0, 0, -1, 0], buttons: [] }

/**
 * A wizard that was through the first step.
 *
 * @returns the wizard, in the second step
 */
function atTheEnds(): Wizard {
  const wizard = new Wizard()

  for (let i = 0; i < MIN_REST_READS; i += 1) {
    wizard.feed(REST)
  }
  wizard.toMove()

  return wizard
}

/**
 * Moves every stick to both of its ends.
 *
 * @param wizard the wizard
 * @param axes the axes that are moved
 */
function moveAll(wizard: Wizard, axes: number[]): void {
  for (const value of [-1, 1]) {
    wizard.feed({ axes: [0, 1, 2, 3].map(axis => (axes.includes(axis) ? value : REST.axes[axis]!)), buttons: [] })
  }
}

/**
 * Whether the wizard gave a mapping.
 *
 * @param result what it gave
 * @returns true for a mapping
 */
function isProfile(result: Profile | Failure): result is Profile {
  return 'rows' in result
}

describe('the first step of the wizard', () => {
  it('is done when it has enough reads at rest, and only then goes on', () => {
    const wizard = new Wizard()

    for (let i = 0; i < MIN_REST_READS - 1; i += 1) {
      wizard.feed(REST)
    }
    expect(wizard.restDone()).toBe(false)
    expect(wizard.toMove()).toBe(false)
    expect(wizard.step).toBe('rest')
    wizard.feed(REST)
    expect(wizard.restDone()).toBe(true)
    expect(wizard.toMove()).toBe(true)
    expect(wizard.step).toBe('move')
  })
})

describe('the end of the wizard', () => {
  it('gives the mapping its mark when every stick was moved to both of its ends', () => {
    const wizard = atTheEnds()
    moveAll(wizard, [0, 1, 2, 3])
    const result = wizard.finish(suggestedProfile('pad', null))

    expect(isProfile(result) && result.calibrated).toBe(true)
  })

  it('gives no mark, and says which axes it lacks, when a stick was not moved to both ends', () => {
    const wizard = atTheEnds()
    moveAll(wizard, [0, 1, 3])
    const result = wizard.finish(suggestedProfile('pad', null))

    expect(isProfile(result)).toBe(false)
    expect(result).toEqual({ axes: [2] })
    expect(wizard.travel(2)).toBe(0)
    expect(wizard.travel(0)).toBe(2)
  })
})

describe('the end of the wizard, when it is not whole', () => {
  it('gives no mark before the second step', () => {
    const wizard = new Wizard()

    expect(wizard.finish(suggestedProfile('pad', null))).toEqual({ axes: [] })
  })

  it('does not count the moves of the second step for the middle', () => {
    const wizard = atTheEnds()
    moveAll(wizard, [0, 1, 2, 3])
    wizard.feed({ axes: [1, 1, 1, 1], buttons: [] })
    const result = wizard.finish(suggestedProfile('pad', null))

    expect(isProfile(result) && result.rows[0]).toMatchObject({ calibration: { min: -1, center: 0, max: 1 } })
  })
})
