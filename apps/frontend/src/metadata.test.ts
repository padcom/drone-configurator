import { describe, expect, it } from 'vitest'
import { APM_PDEF } from './apmPdef'
import { METADATA_FORMAT, checkMeta, parseMetadata } from './metadata'

const file = (params: unknown) => JSON.stringify({ format: METADATA_FORMAT, version: 1, params })

describe('parameter metadata', () => {
  it('reads descriptions, units, ranges and values, ignoring what it doesn\'t know', () => {
    const known = { description: 'Return altitude', units: 'cm', min: 200, max: 300000 }
    const m = parseMetadata(file({ RTL_ALT: { ...known, extra: true } }))
    expect(m).toEqual(new Map([['RTL_ALT', known]]))
  })

  it('reads the long description, bits, increment and reboot flag of our own format, which stay optional', () => {
    const full = {
      description: 'Frame',
      longDescription: 'Controls the frame class.',
      increment: 1,
      bits: { 0: 'All' },
      rebootRequired: true,
    }
    const m = parseMetadata(file({ FRAME_CLASS: full, PLAIN: { description: 'Only this' }, BAD: { increment: 'x', bits: [] } }))

    expect(m).toEqual(new Map<string, unknown>([['FRAME_CLASS', full], ['PLAIN', { description: 'Only this' }], ['BAD', {}]]))
  })

  it('refuses what isn\'t metadata', () => {
    expect(parseMetadata('[')).toBe('not JSON')
    expect(parseMetadata('{}')).toBe('not a Drone Configurator metadata file')
    const newer = JSON.stringify({ format: METADATA_FORMAT, version: 9, params: {} })
    expect(parseMetadata(newer)).toBe('metadata version 9 (this app reads version 1)')
  })
})

describe('the check of a value against the metadata', () => {
  it('warns about a value outside the range or the values, and says nothing without metadata', () => {
    expect(checkMeta(undefined, 1e9)).toBeNull()
    expect(checkMeta({ min: 200, max: 300000, units: 'cm' }, 100)).toBe('Outside the usual range 200–300000 cm')
    expect(checkMeta({ min: 200, max: 300000, units: 'cm' }, 400000)).toBe('Outside the usual range 200–300000 cm')
    expect(checkMeta({ min: 200, max: 300000 }, 200)).toBeNull()
    expect(checkMeta({ max: 10 }, 11)).toBe('Outside the usual range …–10')
    const values = { 0: 'Disabled', 1: 'Enabled' }
    expect(checkMeta({ values }, 2)).toBe('Not one of the usual values: 0 (Disabled), 1 (Enabled)')
    expect(checkMeta({ values: { 0: 'Disabled', 1: 'Enabled' } }, 1)).toBeNull()
  })
})

describe('ArduPilot definition files (apm.pdef.json)', () => {
  it('are read: the display name is the short text, the description the long one', () => {
    const m = parseMetadata(JSON.stringify(APM_PDEF)) as Map<string, unknown>

    expect([...m.keys()]).toEqual(['RTL_ALT', 'FRAME_CLASS', 'ARMING_CHECK', 'BATT_CAPACITY'])
    expect(m.get('RTL_ALT')).toEqual({
      description: 'RTL Altitude',
      longDescription: 'The minimum alt above home the vehicle will climb to before returning.',
      units: 'cm',
      min: 30,
      max: 300000,
      increment: 1,
    })
    expect(m.get('FRAME_CLASS')).toMatchObject({ rebootRequired: true, values: { 1: 'Quad', 2: 'Hexa' } })
    expect(m.get('ARMING_CHECK')).toMatchObject({ bits: { 0: 'All', 3: 'GPS lock' } })
    expect(m.get('BATT_CAPACITY')).toMatchObject({ units: 'mAh', increment: 50 })
  })

  it('can have only a text description, or no parameters', () => {
    const only = { json: { version: 0 }, G: { A: { description: 'Text only' }, B: 'not an object' } }

    expect(parseMetadata(JSON.stringify(only))).toEqual(new Map([['A', { description: 'Text only' }]]))
    expect(parseMetadata('{"json":{"version":0}}')).toEqual(new Map())
  })
})
