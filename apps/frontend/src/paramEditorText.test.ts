import { expect, it } from 'vitest'
import { metadataText, numberOr, relatedTo, valueOptions } from './paramEditor'
import { translate } from './testing'
import { PARAMS } from './fixtures'

const param = PARAMS.find(p => p.id === 'RTL_ALT')!

it('says how many parameters the metadata describes, or nothing', () => {
  expect(metadataText(0, 0, 3, translate)).toBe('Metadata for 3 parameters')
  expect(metadataText(2, 5, 3, translate)).toBe('Loaded descriptions for 2 of 5 parameters')
  expect(metadataText(0, 5, 3, translate)).toMatch(/^Loaded descriptions for 0 of 5 parameters: none of the 3/u)
  expect(metadataText(0, 5, 0, translate)).toBe('')
})

it('takes a number from the text of a draft, and the fallback for text that is not one', () => {
  expect([numberOr('1600', 5), numberOr('2.5', 5), numberOr('', 5), numberOr('  ', 5), numberOr('abc', 5)])
    .toEqual([1600, 2.5, 5, 5, 5])
})

it('turns the named values of the metadata into options, by number, and none without them', () => {
  expect(valueOptions({ values: { 2: 'Always land', 0: 'Report only' } }))
    .toEqual([{ value: 0, label: 'Report only' }, { value: 2, label: 'Always land' }])
  expect(valueOptions({ description: 'x' })).toBeNull()
  expect(valueOptions(undefined)).toBeNull()
  expect(valueOptions({ values: { one: 'Not a number' } })).toBeNull()
})

it('relates a parameter to the others of its group, at most six, and to none when it has no group of its own', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ ...param, id: `X_${i}`, index: i }))

  expect(relatedTo(PARAMS, 'BATT_CAPACITY')).toEqual(['BATT_LOW_VOLT'])
  expect(relatedTo(many, 'X_0')).toEqual(['X_1', 'X_2', 'X_3', 'X_4', 'X_5', 'X_6'])
  expect(relatedTo([{ ...param, id: 'FRAME' }, { ...param, id: 'RC' }], 'FRAME')).toEqual([])
  expect(relatedTo(PARAMS, 'RTL_ALT')).toEqual([])
})
