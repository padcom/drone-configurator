import { describe, expect, it } from 'vitest'
import { PARAMS } from '@/mock/fixtures'
import type { Metadata } from './metadata'
import { hasUsers, inView, inViewOf, parseView } from './paramView'

const META: Metadata = new Map([
  ['RTL_ALT', { user: 'standard' }],
  ['BATT_CAPACITY', { user: 'advanced' }],
  ['FENCE_RADIUS', { description: 'no user' }],
])

describe('the view in the settings', () => {
  it('is Full unless the entry says Standard', () => {
    const parsed = [parseView('standard'), parseView('full'), parseView(undefined), parseView('x')]

    expect(parsed).toEqual(['standard', 'full', 'full', 'full'])
  })
})

describe('the metadata that tells standard from advanced', () => {
  it('is there when some parameter has a User, and not without metadata or without a User', () => {
    expect(hasUsers(META)).toBe(true)
    expect(hasUsers(new Map())).toBe(false)
    expect(hasUsers(new Map([['A', { description: 'x' }]]))).toBe(false)
  })
})

describe('what a view lists', () => {
  it('is everything in Full, and in Standard all but what is marked advanced, so what is not marked stays', () => {
    expect(inView({ user: 'advanced' }, 'full')).toBe(true)
    expect(inView({ user: 'advanced' }, 'standard')).toBe(false)
    expect(inView({ user: 'standard' }, 'standard')).toBe(true)
    expect(inView({}, 'standard')).toBe(true)
    expect(inView(undefined, 'standard')).toBe(true)
  })

  it('keeps the order of the list, and the list itself in Full', () => {
    expect(inViewOf(PARAMS, META, 'full')).toBe(PARAMS)
    const standard = inViewOf(PARAMS, META, 'standard').map(param => param.id)

    expect(standard).toHaveLength(PARAMS.length - 1)
    expect(standard).not.toContain('BATT_CAPACITY')
    expect(standard).toEqual(PARAMS.map(param => param.id).filter(id => id !== 'BATT_CAPACITY'))
  })
})
