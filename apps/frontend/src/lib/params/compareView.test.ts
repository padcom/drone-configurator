import { expect, it } from 'vitest'
import { translate } from '@/testing/testing'
import type { Param } from '@/generated/app'
import { cellsOf, pickedText, summaryOf } from './compareView'
import type { CompareRow } from './paramCompare'
import { sourceWords } from './snapshotImport'

const RTL: Param = { id: 'RTL_ALT', index: 0, kind: 'int', type: 'INT32', value: 1500 }

/**
 * A row of the comparison.
 *
 * @param over what differs from a row that is the same on both sides
 * @returns the row
 */
const row = (over: Partial<CompareRow>): CompareRow => ({
  id: 'RTL_ALT', param: RTL, other: 1500, status: 'same', change: null, ...over,
})

it('says how each row compares, with the values in their units', () => {
  const meta = { units: 'cm' }

  expect(cellsOf(row({}), meta, translate)).toEqual({ vehicle: '1500 cm', other: '1500 cm', status: 'Same', tone: '' })
  expect(cellsOf(row({ other: null, status: 'vehicleOnly' }), meta, translate))
    .toEqual({ vehicle: '1500 cm', other: '—', status: 'Only on the vehicle', tone: '' })
  const change = { id: 'RTL_ALT', from: 1500, to: 3000, problem: null, warning: null }
  expect(cellsOf(row({ other: 3000, status: 'differs', change }), meta, translate).status).toBe('Different')
})

it('says why a row cannot be copied, and what is unusual about a value, as a warning', () => {
  const missing = { id: 'OLD', from: null, to: 1, problem: 'not on this vehicle', warning: null }
  expect(cellsOf(row({ id: 'OLD', param: null, other: 1, status: 'otherOnly', change: missing }), undefined, translate))
    .toEqual({ vehicle: '—', other: '1', status: 'not on this vehicle', tone: 'warn' })

  const unusual = { id: 'RTL_ALT', from: 1500, to: 9, problem: null, warning: 'below 200' }
  expect(cellsOf(row({ other: 9, status: 'differs', change: unusual }), undefined, translate))
    .toMatchObject({ status: 'below 200. Check it before you write it.', tone: 'warn' })
})

it('counts the rows of each kind, and says what is copied across', () => {
  expect(summaryOf({ differs: 3, vehicleOnly: 2, otherOnly: 1, same: 1400 }, translate))
    .toBe('Different: 3; only on the vehicle: 2; not on the vehicle: 1; the same: 1400.')
  expect(pickedText(0, translate)).toBe('Tick the values to copy across.')
  expect(pickedText(2, translate)).toBe('To copy across: 2. Nothing is written until you review and confirm.')
})

it('names the firmware defaults as the source of a review and of a comparison', () => {
  expect(sourceWords({ kind: 'defaults' }, translate)).toEqual({ heading: 'Firmware defaults', column: 'Default' })
})
