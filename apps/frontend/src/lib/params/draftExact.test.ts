// A value the vehicle cannot be given exactly is a problem of the draft, said before the write: ArduPilot takes a parameter over
// MAVLink as a 32-bit float, which holds every integer up to 2^24 and above that only some.
import { describe, expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { validateDraft } from './draft'

const int32: Param = { id: 'LOG_BITMASK', index: 0, kind: 'int', type: 'INT32', value: 0 }
const real: Param = { id: 'RTL_ALT', index: 1, kind: 'real', type: 'REAL32', value: 0 }

describe('a draft of a whole-number parameter', () => {
  it('is fine up to 2^24, and where a float is exact above it (a power of two)', () => {
    expect(validateDraft(int32, '16777216')).toBeNull()
    expect(validateDraft(int32, '131076')).toBeNull()
    expect(validateDraft(int32, '-1')).toBeNull()
    expect(validateDraft(int32, '-17')).toBeNull()
    expect(validateDraft(int32, '1073741824')).toBeNull()
    expect(validateDraft(int32, '2147483520')).toBeNull()
  })

  it('is a problem, said before the write, where a float cannot hold it', () => {
    expect(validateDraft(int32, '16777217')).toContain('32-bit floats')
    expect(validateDraft(int32, '16777217')).toContain('16777217')
    expect(validateDraft(int32, '2147483647')).toContain('cannot be written exactly')
    expect(validateDraft(int32, '-1073741825')).toContain('cannot be written exactly')
  })

  it('is not asked of a parameter that is a float', () => {
    expect(validateDraft(real, '16777217')).toBeNull()
    expect(validateDraft(real, '0.1')).toBeNull()
  })
})
