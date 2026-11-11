import { describe, expect, it } from 'vitest'
import { PARAMS } from '@/mock/fixtures'
import { changedIds, clockText, initialOf } from './initialValues'

describe('the initial values', () => {
  it('are the value of every parameter at the download, with the time of it', () => {
    const initial = initialOf(PARAMS, 1234)

    expect(initial.at).toBe(1234)
    expect(initial.values.size).toBe(PARAMS.length)
    expect(initial.values.get('RTL_ALT')).toBe(1500)
  })
})

describe('the parameters that changed from their initial value', () => {
  const initial = initialOf(PARAMS, 0)
  const withValue = (id: string, value: number) => PARAMS.map(param => param.id === id ? { ...param, value } : param)

  it('are the ones whose value is not the initial one now, whoever changed it', () => {
    expect([...changedIds(PARAMS, initial)]).toEqual([])
    expect([...changedIds(withValue('RTL_ALT', 1600), initial)]).toEqual(['RTL_ALT'])
    const two = withValue('RTL_ALT', 1600).map(p => p.id === 'FENCE_RADIUS' ? { ...p, value: 1 } : p)
    expect([...changedIds(two, initial)].sort()).toEqual(['FENCE_RADIUS', 'RTL_ALT'])
  })

  it('are not there again when the value goes back to the initial one', () => {
    expect([...changedIds(withValue('RTL_ALT', 1500), initial)]).toEqual([])
  })

  it('are none without initial values, and a parameter that has none is never one of them', () => {
    expect(changedIds(withValue('RTL_ALT', 1), null).size).toBe(0)
    const extra = [...PARAMS, { id: 'NEW_ONE', index: 99, kind: 'int' as const, type: 'INT32', value: 5 }]

    expect(changedIds(extra, initial).size).toBe(0)
  })
})

describe('the time of the download', () => {
  it('is hours, minutes and seconds in the local time, with the zeros', () => {
    expect(clockText(new Date(2026, 10, 10, 9, 5, 3).getTime())).toBe('09:05:03')
    expect(clockText(new Date(2026, 10, 10, 14, 2, 11).getTime())).toBe('14:02:11')
  })
})
