// What a bound field says of its parameter: the vehicle's value, a modified draft, a write under way, verified or rejected, and a
// draft over a value the vehicle changed (a conflict) and how that is settled.
import { describe, expect, it } from 'vitest'
import { type FieldFacts, settled, shownValue, statusOf } from './fieldState'

/**
 * What a field knows, with what is not said as it is at rest.
 *
 * @param more what differs
 * @returns the facts
 */
function facts(more: Partial<FieldFacts> = {}): FieldFacts {
  return { vehicle: 1500, draft: null, basis: undefined, write: 'idle', ...more }
}

describe('the status of a field', () => {
  it('is unknown before the vehicle says its value, whatever else is there', () => {
    expect(statusOf(facts({ vehicle: undefined }))).toBe('unknown')
    expect(statusOf(facts({ vehicle: undefined, draft: 3, write: 'writing' }))).toBe('unknown')
  })

  it('is the vehicle\'s with no draft, or a draft that is the vehicle\'s value', () => {
    expect(statusOf(facts())).toBe('vehicle')
    expect(statusOf(facts({ draft: 1500, basis: 1500 }))).toBe('vehicle')
  })

  it('is modified with a draft that is another value', () => {
    expect(statusOf(facts({ draft: 1800, basis: 1500 }))).toBe('draft')
    expect(statusOf(facts({ draft: 1800 }))).toBe('draft')
  })
})

describe('a write', () => {
  it('is said first: under way, verified, rejected', () => {
    expect(statusOf(facts({ draft: 1800, write: 'writing' }))).toBe('writing')
    expect(statusOf(facts({ vehicle: 1800, draft: 1800, write: 'verified' }))).toBe('verified')
    expect(statusOf(facts({ draft: 1800, write: 'rejected' }))).toBe('rejected')
  })

  it('is said before a conflict', () => {
    expect(statusOf(facts({ vehicle: 1600, draft: 1800, basis: 1500, write: 'writing' }))).toBe('writing')
  })
})

describe('a conflict', () => {
  it('is a draft over a value the vehicle changed since the draft was begun', () => {
    expect(statusOf(facts({ vehicle: 1600, draft: 1800, basis: 1500 }))).toBe('conflict')
    expect(statusOf(facts({ vehicle: 1800, draft: 1800, basis: 1500 }))).toBe('conflict')
  })

  it('is none when the vehicle has not changed it, or there is no draft', () => {
    expect(statusOf(facts({ vehicle: 1600, draft: null, basis: 1500 }))).toBe('vehicle')
    expect(statusOf(facts({ vehicle: 1500, draft: 1800, basis: 1500 }))).toBe('draft')
  })

  it('is settled by keeping the draft (the vehicle\'s new value is its basis now) or taking the vehicle\'s value', () => {
    const conflict = facts({ vehicle: 1600, draft: 1800, basis: 1500 })
    const kept = settled('keep', conflict)

    expect(kept).toEqual({ draft: 1800, basis: 1600 })
    expect(statusOf({ ...conflict, ...kept })).toBe('draft')
    expect(settled('take', conflict)).toEqual({ draft: null, basis: undefined })
    expect(statusOf({ ...conflict, ...settled('take', conflict) })).toBe('vehicle')
  })
})

describe('the value a field shows', () => {
  it('is the draft when there is one, else the vehicle\'s', () => {
    expect(shownValue(facts({ draft: 1800 }))).toBe(1800)
    expect(shownValue(facts({ draft: 0 }))).toBe(0)
    expect(shownValue(facts())).toBe(1500)
    expect(shownValue(facts({ vehicle: undefined }))).toBeUndefined()
  })
})
