import { describe, expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { defaultsOf, modifiedIds } from './defaults'

/**
 * A parameter.
 *
 * @param id its name
 * @param value its value
 * @param extra anything else
 * @returns the parameter
 */
function p(id: string, value: number, extra: Partial<Param> = {}): Param {
  return { id, index: 0, kind: 'int', type: 'INT32', value, ...extra }
}

describe('the firmware defaults of a list', () => {
  it('are each parameter\'s default where the file gave one, and its value where it gave none (it was at its default)', () => {
    const defaults = defaultsOf([p('BATT_CAPACITY', 5200, { default: 3300 }), p('RTL_ALT', 1500)], true)

    expect(defaults).toEqual(new Map([['BATT_CAPACITY', 3300], ['RTL_ALT', 1500]]))
  })

  it('are not known when the list does not say it came with them', () => {
    expect(defaultsOf([p('RTL_ALT', 1500)], undefined)).toBeNull()
    expect(defaultsOf([p('RTL_ALT', 1500)], false)).toBeNull()
  })
})

describe('the parameters modified from default', () => {
  const defaults = new Map([['BATT_CAPACITY', 3300], ['RTL_ALT', 1500], ['LOW', 10.5]])

  it('are those whose value now is not the default, also after a write', () => {
    const params = [p('BATT_CAPACITY', 5200), p('RTL_ALT', 1500), p('NEW_ONE', 7)]

    expect(modifiedIds(params, defaults)).toEqual(new Set(['BATT_CAPACITY']))
    expect(modifiedIds([p('BATT_CAPACITY', 3300), p('RTL_ALT', 2000)], defaults)).toEqual(new Set(['RTL_ALT']))
  })

  it('compare a float as the vehicle holds it, and are none while the defaults are not known', () => {
    const low = p('LOW', Math.fround(10.5), { kind: 'real', type: 'REAL32' })

    expect(modifiedIds([low], defaults)).toEqual(new Set())
    expect(modifiedIds([p('BATT_CAPACITY', 5200)], null)).toEqual(new Set())
  })
})
