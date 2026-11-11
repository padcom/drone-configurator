import { describe, expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { compareNames, sortedByName, withInPlace } from './naturalOrder'
import { groupsOf } from './paramGroups'
import { indexFor, search } from './paramSearch'

const param = (id: string, index = 0): Param => ({ id, index, kind: 'int', type: 'INT16', value: 0 })
const sorted = (names: string[]) => [...names].sort(compareNames)

describe('the natural order of names', () => {
  it('compares a run of digits as a number, so 2 comes before 10', () => {
    expect(sorted(['RC10_MIN', 'RC2_MIN', 'RC1_MIN', 'RC9_MIN'])).toEqual(['RC1_MIN', 'RC2_MIN', 'RC9_MIN', 'RC10_MIN'])
    const servos = sorted(['SERVO10_FUNCTION', 'SERVO3_FUNCTION', 'SERVO2_MAX'])

    expect(servos).toEqual(['SERVO2_MAX', 'SERVO3_FUNCTION', 'SERVO10_FUNCTION'])
  })

  it('compares the digits of any length without rounding, and a leading zero is not a difference of size', () => {
    expect(compareNames('A99999999999999999999', 'A100000000000000000000')).toBeLessThan(0)
    expect(compareNames('A007', 'A8')).toBeLessThan(0)
    expect(compareNames('A007', 'A7')).toBe(0)
  })

  it('does not mind the case of letters', () => {
    expect(sorted(['b_x', 'A_y', 'B_a', 'a_Z'])).toEqual(['A_y', 'a_Z', 'B_a', 'b_x'])
    expect(compareNames('Batt_Cap', 'BATT_CAP')).toBe(0)
  })

  it('puts the underscore before digits and letters: BATT_CAPACITY before BATT2_CAPACITY, FS_ before FS2', () => {
    const batteries = sorted(['BATT2_CAPACITY', 'BATT_CAPACITY', 'BATT10_CAPACITY'])

    expect(batteries).toEqual(['BATT_CAPACITY', 'BATT2_CAPACITY', 'BATT10_CAPACITY'])
    expect(sorted(['FS2_X', 'FS_X', 'FSA_X'])).toEqual(['FS_X', 'FS2_X', 'FSA_X'])
  })

  it('puts a name before a longer one that starts with it, and is the same for the same name', () => {
    expect(sorted(['RTL_ALT_FINAL', 'RTL_ALT', 'RTL'])).toEqual(['RTL', 'RTL_ALT', 'RTL_ALT_FINAL'])
    expect(compareNames('RTL_ALT', 'RTL_ALT')).toBe(0)
    expect(compareNames('', '')).toBe(0)
  })
})

describe('the parameters in that order', () => {
  it('are a new list, in the order of their names, and names that compare equal keep the order they came in', () => {
    const list = [param('B_1', 0), param('a_1', 1), param('A_1', 2), param('C_10', 3), param('C_9', 4)]
    const result = sortedByName(list)

    expect(result.map(p => p.id)).toEqual(['a_1', 'A_1', 'B_1', 'C_9', 'C_10'])
    expect(list.map(p => p.id)).toEqual(['B_1', 'a_1', 'A_1', 'C_10', 'C_9'])
  })

  it('take one more in its place by name, and at the end when it comes last, and at the start when first', () => {
    const list = sortedByName([param('B_1'), param('D_1')])

    expect(withInPlace(list, param('C_1')).map(p => p.id)).toEqual(['B_1', 'C_1', 'D_1'])
    expect(withInPlace(list, param('Z_1')).map(p => p.id)).toEqual(['B_1', 'D_1', 'Z_1'])
    expect(withInPlace(list, param('A_1')).map(p => p.id)).toEqual(['A_1', 'B_1', 'D_1'])
    expect(withInPlace([], param('A_1')).map(p => p.id)).toEqual(['A_1'])
  })

  it('sort a list of 1400 names, as a vehicle has, in a few milliseconds', () => {
    const names = Array.from({ length: 1400 }, (_, i) => `GRP${(i * 7919) % 97}_NAME${(i * 104729) % 1013}`)
    const list = names.map((id, index) => param(id, index))

    const started = performance.now()
    const result = sortedByName(list)
    const took = performance.now() - started

    expect(result.map(p => p.id)).toEqual(sorted(names))
    expect(took).toBeLessThan(100)
  })
})

describe('the groups and the search, in that order', () => {
  it('have the groups in the natural order, OTHER last', () => {
    const list = sortedByName(['RC10_MIN', 'RC2_MIN', 'RC1_MIN', 'ZETA', 'BATT_A', 'BATT2_A'].map(id => param(id)))

    expect(groupsOf(list).map(group => group.id)).toEqual(['BATT', 'BATT2', 'RC1', 'RC2', 'RC10', 'OTHER'])
  })

  it('keep the ranking first and break the ties in the order of the names', () => {
    const list = sortedByName(['SERVO10_MIN', 'SERVO2_MIN', 'MIN_SERVO', 'SERVO_MIN', 'SERVO1_MIN'].map(id => param(id)))
    const hits = search(indexFor(null, list.map(p => p.id), new Map()), 'servo').map(hit => hit.id)

    // Names that start with the query come before the others (the ranking), each group in the order of the names.
    expect(hits).toEqual(['SERVO_MIN', 'SERVO1_MIN', 'SERVO2_MIN', 'SERVO10_MIN', 'MIN_SERVO'])
  })
})
