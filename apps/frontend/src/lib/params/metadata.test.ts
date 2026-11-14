import { describe, expect, it } from 'vitest'
import { APM_PDEF } from '@/mock/apmPdef'
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
    expect(parseMetadata('{}')).toMatch(/^not a parameter metadata file/u)
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
      user: 'standard',
    })
    expect(m.get('FRAME_CLASS')).toMatchObject({ rebootRequired: true, values: { 1: 'Quad', 2: 'Hexa' } })
    expect(m.get('ARMING_CHECK')).toMatchObject({ bits: { 0: 'All', 3: 'GPS lock' } })
    expect(m.get('BATT_CAPACITY')).toMatchObject({ units: 'mAh', increment: 50 })
  })

  it('can have only a text description, or no parameters', () => {
    const only = { json: { version: 0 }, G: { A: { Description: 'Text only' }, B: 'not an object' } }

    expect(parseMetadata(JSON.stringify(only))).toEqual(new Map([['A', { description: 'Text only' }]]))
  })

  it('say so when they have no parameters, rather than loading nothing', () => {
    expect(parseMetadata('{"json":{"version":0}}')).toBe('it describes no parameters')
    expect(parseMetadata(file({}))).toBe('it describes no parameters')
  })
})

describe('who a parameter is for', () => {
  it('is kept as standard or advanced, whatever the case, from both kinds of file, and left out for anything else', () => {
    const pdef = { json: { version: 0 }, G: { A: { User: 'Advanced' }, B: { user: 'STANDARD' }, C: { User: 'Expert' }, D: {} } }
    const own = file({ E: { user: 'advanced', description: 'x' }, F: { user: 3, description: 'y' } })

    const expected = new Map([['A', { user: 'advanced' }], ['B', { user: 'standard' }], ['C', {}], ['D', {}]])

    expect(parseMetadata(JSON.stringify(pdef))).toEqual(expected)
    expect(parseMetadata(own)).toEqual(new Map([['E', { user: 'advanced', description: 'x' }], ['F', { description: 'y' }]]))
  })
})

describe('ArduPilot definition files, with the flags of a parameter', () => {
  it('keep ReadOnly and Volatile (written as the text "True"), and leave them out when the file says nothing', () => {
    const stats = {
      json: { version: 0 },
      STAT_: {
        STAT_RUNTIME: { Description: 'Total runtime', ReadOnly: 'True' },
        STAT_FLTTIME: { Description: 'Flight time', Volatile: 'True', ReadOnly: 'False' },
        STAT_OTHER: { Description: 'Plain' },
      },
    }

    const meta = parseMetadata(JSON.stringify(stats)) as Map<string, { readOnly?: boolean, volatile?: boolean }>

    expect(meta.get('STAT_RUNTIME')).toMatchObject({ readOnly: true })
    expect(meta.get('STAT_FLTTIME')).toMatchObject({ readOnly: false, volatile: true })
    expect('readOnly' in (meta.get('STAT_OTHER') ?? {})).toBe(false)
  })

  it('keep them in our own format too', () => {
    const own = { format: METADATA_FORMAT, version: 1, params: { A: { readOnly: true, volatile: false } } }

    expect(parseMetadata(JSON.stringify(own))).toEqual(new Map([['A', { readOnly: true, volatile: false }]]))
  })
})

describe('ArduPilot definition files, in the case of their keys', () => {
  it('are read in the case the generator wrote the keys (capitalised), and in lower case too', () => {
    const a = { displayName: 'Short', description: 'Long', units: 'cm', range: { low: '1', high: '2' } }
    const lower = { json: { version: 0 }, G: { A: a } }

    expect(parseMetadata(JSON.stringify(lower))).toEqual(new Map([
      ['A', { description: 'Short', longDescription: 'Long', units: 'cm', min: 1, max: 2 }],
    ]))
    // The keys of the real file, as jsonemit.py dumps a parameter's own attributes: nothing is lost to the case.
    const real = parseMetadata(JSON.stringify(APM_PDEF)) as Map<string, { description?: string, longDescription?: string }>
    expect([...real.values()].every(meta => meta.description !== undefined)).toBe(true)
    expect(real.get('RTL_ALT')?.longDescription).toBe('The minimum alt above home the vehicle will climb to before returning.')
  })
})

describe('ArduPilot definition files, recognised and refused', () => {
  it('are recognised by their first key, `json`, with or without a version number', () => {
    expect(parseMetadata('{"json":{},"G":{"A":{"Description":"x"}}}')).toEqual(new Map([['A', { description: 'x' }]]))
  })

  it('say why a file is not metadata: an XML file, JSON of another kind, text', () => {
    expect(parseMetadata('<?xml version="1.0"?><paramfile/>')).toMatch(/^an XML file: only JSON is read/u)
    expect(parseMetadata('{"vehicles":[]}')).toMatch(/^not a parameter metadata file: expected ArduPilot's apm\.pdef\.json/u)
    expect(parseMetadata('hello')).toBe('not JSON')
  })
})

it('puts the version a file claims in the message cut short and without control characters', () => {
  const text = `{"format":"drone-configurator/param-metadata","version":"${'x'.repeat(100)}\\u0007\\nend","params":{}}`
  const said = parseMetadata(text)

  expect(typeof said).toBe('string')
  expect(String(said)).toContain(`${'x'.repeat(40)}…`)
  // eslint-disable-next-line no-control-regex
  expect(/[\u0000-\u001f]/u.test(String(said))).toBe(false)
})
