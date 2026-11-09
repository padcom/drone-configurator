import { describe, expect, it } from 'vitest'
import { THEME_KEY, firstPaint } from './firstPaint'

/**
 * A storage in memory.
 *
 * @param initial what it holds at first
 * @returns the storage
 */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  }
}

const broken = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('the copy of the theme for the first paint', () => {
  it('is read when it names a theme, and not otherwise, whatever the storage holds', () => {
    const kept = (stored?: string) => firstPaint(memoryStorage(stored ? { [THEME_KEY]: stored } : {}))?.read()

    expect(['system', 'light', 'dark'].map(kept)).toEqual(['system', 'light', 'dark'])
    expect([kept(), kept('purple'), kept('<script>'), kept('')]).toEqual([null, null, null, null])
  })

  it('is written, and forgotten when the settings name no theme', () => {
    const storage = memoryStorage()
    const copy = firstPaint(storage)

    copy?.write('dark')
    expect(storage.data.get(THEME_KEY)).toBe('dark')
    copy?.write(null)

    expect(storage.data.has(THEME_KEY)).toBe(false)
  })

  it('does not break the interface when storage is missing, full or forbidden', () => {
    const copy = firstPaint(broken)

    expect(firstPaint(null)).toBeNull()
    expect(copy?.read()).toBeNull()
    expect(() => copy?.write('dark')).not.toThrow()
    expect(() => copy?.write(null)).not.toThrow()
  })
})
