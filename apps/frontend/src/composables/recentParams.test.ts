import { describe, expect, it } from 'vitest'
import { createConfigurator } from './useConfigurator'
import { mockBackend } from '@/mock/mock-backend'
import { MAX_RECENT, RECENT_KEY, used, useRecentParams } from './recentParams'

describe('the list of the recently used', () => {
  it('puts a name first, once, and keeps the newest MAX_RECENT', () => {
    expect(used(['A', 'B', 'C'], 'C')).toEqual(['C', 'A', 'B'])
    const many = Array.from({ length: MAX_RECENT }, (_, i) => `P${i}`)

    expect(used(many, 'NEW')).toHaveLength(MAX_RECENT)
    expect(used(many, 'NEW')[0]).toBe('NEW')
    expect(used(many, 'NEW')).not.toContain(`P${MAX_RECENT - 1}`)
  })
})

describe('the recently used parameters of the interface', () => {
  it('are kept in the settings under one key, newest first, and read back from them', async () => {
    const handle = createConfigurator(mockBackend())
    await handle.settings.load()
    const recent = useRecentParams()

    await recent.touch('RTL_ALT')
    await recent.touch('BATT_CAPACITY')
    await recent.touch('RTL_ALT')

    expect(recent.names.value).toEqual(['RTL_ALT', 'BATT_CAPACITY'])
    expect(handle.settings.uiValue(RECENT_KEY)).toBe('["RTL_ALT","BATT_CAPACITY"]')
    expect(recent.set.value.has('BATT_CAPACITY')).toBe(true)
  })
})
