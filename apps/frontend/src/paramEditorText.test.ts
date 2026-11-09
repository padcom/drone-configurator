import { expect, it } from 'vitest'
import { canWrite, detailsOf, metadataText, writeNotice } from './paramEditor'
import { translate } from './testing'
import { PARAMS, VEHICLE } from './fixtures'

const param = PARAMS.find(p => p.id === 'RTL_ALT')!
const idle = { connection: { state: 'connected' as const, vehicle: { ...VEHICLE } }, writing: false, draftError: null, draft: '' }

it('describes each write outcome', () => {
  expect(writeNotice(false, { kind: 'verified', id: param.id, value: 2000 }, param.id, translate))
    .toEqual({ tone: 'ok', text: 'Written and read back: 2000.' })
  expect(writeNotice(false, { kind: 'changed', id: param.id, asked: 2000, reported: 1999 }, param.id, translate))
    .toEqual({ tone: 'warn', text: 'The vehicle reports 1999, not 2000: it changed or refused the value.' })
  expect(writeNotice(false, { kind: 'failed', id: param.id, message: 'TIMEOUT: no reply' }, param.id, translate)).toEqual({
    tone: 'error',
    text: 'Not confirmed: TIMEOUT: no reply. The value on the vehicle is unknown; download again to see it.',
  })
})

it('says nothing about a write to another parameter, and says a write is under way', () => {
  expect(writeNotice(false, { kind: 'verified', id: 'OTHER', value: 1 }, param.id, translate)).toBeNull()
  expect(writeNotice(false, null, param.id, translate)).toBeNull()
  expect(writeNotice(true, null, param.id, translate)?.text).toContain('Writing…')
})

it('enables writing only for a valid, changed value while connected', () => {
  expect(canWrite({ ...idle, draft: '2000' }, param)).toBe(true)
  expect(canWrite({ ...idle, draft: String(param.value) }, param)).toBe(false)
  expect(canWrite({ ...idle, draft: '2000', draftError: 'bad' }, param)).toBe(false)
  expect(canWrite({ ...idle, draft: '2000', connection: { state: 'lost' } }, param)).toBe(false)
  expect(canWrite({ ...idle, draft: '2000', writing: true }, param)).toBe(false)
  expect(canWrite({ ...idle, draft: '2000' }, null)).toBe(false)
})

it('adds what the metadata knows: unit, named value, range, allowed values', () => {
  const meta = { description: 'Return altitude', units: 'cm', min: 200, max: 8000, values: { 1500: 'Default', 2000: 'High' } }

  expect(detailsOf(meta, 1500, translate)).toEqual({
    units: ' cm',
    named: ' (Default)',
    description: 'Return altitude',
    range: 'Range: 200 to 8000 cm',
    values: 'Values: 1500 Default, 2000 High',
  })
  expect(detailsOf({ min: 5 }, 1, translate)).toMatchObject({ range: 'Range: 5 to …', named: '', units: '' })
  expect(detailsOf(undefined, 1, translate)).toEqual({ units: '', named: '', description: null, range: null, values: null })
})

it('says how many parameters the metadata describes, or nothing', () => {
  expect(metadataText(3, translate)).toBe('Metadata for 3 parameters')
  expect(metadataText(0, translate)).toBe('')
})
