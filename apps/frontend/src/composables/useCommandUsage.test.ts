import { describe, expect, it } from 'vitest'
import { RECENT_MAX, parseRecent, withUsed } from './useCommandUsage'

describe('the commands run lately, read from the settings', () => {
  it.each([
    ['nothing', undefined, []],
    ['a list', '["go.plan","vehicle.reboot"]', ['go.plan', 'vehicle.reboot']],
    ['text that is not JSON', '{oops', []],
    ['JSON that is not a list', '{"a":1}', []],
    ['a list with things that are not texts', '["go.plan",3,null,"go.logs"]', ['go.plan', 'go.logs']],
  ])('is guarded: %s', (_what, text, expected) => {
    expect(parseRecent(text)).toEqual(expected)
  })

  it('keeps at most RECENT_MAX, the newest first', () => {
    const many = Array.from({ length: RECENT_MAX + 5 }, (_, i) => `c.${i}`)

    expect(parseRecent(JSON.stringify(many))).toEqual(many.slice(0, RECENT_MAX))
  })
})

describe('putting a command first', () => {
  it('moves one that is in the list to the front, without a second copy', () => {
    expect(withUsed(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('adds a new one at the front and drops the oldest beyond RECENT_MAX', () => {
    const full = Array.from({ length: RECENT_MAX }, (_, i) => `c.${i}`)
    const next = withUsed(full, 'new')

    expect(next).toHaveLength(RECENT_MAX)
    expect(next[0]).toBe('new')
    expect(next).not.toContain(`c.${RECENT_MAX - 1}`)
  })
})
