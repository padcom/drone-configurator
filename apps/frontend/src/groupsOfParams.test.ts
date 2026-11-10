import { describe, expect, it } from 'vitest'
import type { Param } from './generated/app'
import { OTHER, effectiveGroup, groupOf, groupsOf, inGroup, splitName } from './paramGroups'
import { visibleParams } from './paramList'

/**
 * Parameters with these names.
 *
 * @param ids the names
 * @returns the parameters
 */
const named = (...ids: string[]): Param[] => ids.map((id, index) => ({ id, index, kind: 'int', type: 'UINT8', value: index }))

const PARAMS = named('BATT_CAPACITY', 'BATT_LOW_VOLT', 'RTL_ALT', 'ARMING_CHECK', 'SYSID_THISMAV', 'FRAME', '_ODD')

describe('the group of a parameter', () => {
  it('is what comes before the first underscore, and OTHER when there is none or nothing before it', () => {
    expect(['BATT_LOW_VOLT', 'RTL_ALT', 'FRAME', '_ODD'].map(groupOf)).toEqual(['BATT', 'RTL', OTHER, OTHER])
  })

  it('is told in the groups of a list, by name, with OTHER last and the counts', () => {
    expect(groupsOf(PARAMS)).toEqual([
      { id: 'ARMING', count: 1 },
      { id: 'BATT', count: 2 },
      { id: 'RTL', count: 1 },
      { id: 'SYSID', count: 1 },
      { id: OTHER, count: 2 },
    ])
  })

  it('says whether a parameter is in the chosen group, and that every one is in the empty choice', () => {
    expect(inGroup('BATT_CAPACITY', 'BATT')).toBe(true)
    expect(inGroup('BATT_CAPACITY', 'RTL')).toBe(false)
    expect(inGroup('BATT_CAPACITY', '')).toBe(true)
  })
})

describe('the group that is really chosen', () => {
  it('is the one asked for when the list has it, else all (the vehicle may be another one)', () => {
    expect(effectiveGroup(PARAMS, 'BATT')).toBe('BATT')
    expect(effectiveGroup(PARAMS, 'GONE')).toBe('')
    expect(effectiveGroup([], 'BATT')).toBe('')
  })
})

describe('a name for drawing', () => {
  it('is split after the group\'s underscore, and whole when there is none', () => {
    expect(splitName('BATT_LOW_VOLT')).toEqual({ prefix: 'BATT_', rest: 'LOW_VOLT' })
    expect(splitName('FRAME')).toEqual({ prefix: '', rest: 'FRAME' })
  })
})

describe('the visible parameters', () => {
  it('are those in the group that match the search, in their order', () => {
    expect(visibleParams(PARAMS, '', 'BATT').map(param => param.id)).toEqual(['BATT_CAPACITY', 'BATT_LOW_VOLT'])
    expect(visibleParams(PARAMS, 'volt', 'BATT').map(param => param.id)).toEqual(['BATT_LOW_VOLT'])
    expect(visibleParams(PARAMS, 'volt', 'RTL')).toEqual([])
    expect(visibleParams(PARAMS, '', '')).toBe(PARAMS)
  })
})
