import { describe, expect, it } from 'vitest'
import { METADATA_FORMAT, checkMeta, parseMetadata } from './metadata'

const file = (params: unknown) => JSON.stringify({ format: METADATA_FORMAT, version: 1, params })

describe('parameter metadata', () => {
  it('reads descriptions, units, ranges and values, ignoring what it doesn\'t know', () => {
    const known = { description: 'Return altitude', units: 'cm', min: 200, max: 300000 }
    const m = parseMetadata(file({ RTL_ALT: { ...known, extra: true } }))
    expect(m).toEqual(new Map([['RTL_ALT', known]]))
  })

  it('refuses what isn\'t metadata', () => {
    expect(parseMetadata('[')).toBe('not JSON')
    expect(parseMetadata('{}')).toBe('not a Drone Configurator metadata file')
    const newer = JSON.stringify({ format: METADATA_FORMAT, version: 9, params: {} })
    expect(parseMetadata(newer)).toBe('metadata version 9 (this app reads version 1)')
  })

  it('checks ranges and named values, and nothing without metadata', () => {
    expect(checkMeta(undefined, 1e9)).toBeNull()
    expect(checkMeta({ min: 200, max: 300000, units: 'cm' }, 100)).toBe('at least 200 cm')
    expect(checkMeta({ max: 10 }, 11)).toBe('at most 10')
    expect(checkMeta({ values: { 0: 'Disabled', 1: 'Enabled' } }, 2)).toBe('one of 0 (Disabled), 1 (Enabled)')
    expect(checkMeta({ values: { 0: 'Disabled', 1: 'Enabled' } }, 1)).toBeNull()
  })
})
