import { expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import type { Metadata } from './metadata'
import {
  type CompareFilter,
  type CompareRow,
  compareValues,
  copyable,
  countsOf,
  defaultsSide,
  rowShows,
  sideOfText,
  valueText,
} from './paramCompare'
import { saveSnapshot } from './snapshot'

/** The mock vehicle's list with a REAL32 as the wire gives it. */
const VEHICLE_PARAMS: Param[] = [
  ...PARAMS,
  { id: 'ATC_RAT_PIT_P', index: 50, kind: 'real', type: 'REAL32', value: Math.fround(0.135) },
]

/**
 * The other side of a comparison from a file's text, which must be one.
 *
 * @param text the text
 * @returns the rows against the mock vehicle
 */
function rowsOfFile(text: string): CompareRow[] {
  const side = sideOfText(text, { ...VEHICLE })
  if (typeof side === 'string') {
    throw new Error(side)
  }

  return compareValues(side.wanted, VEHICLE_PARAMS)
}

/**
 * A row by its id.
 *
 * @param rows the rows
 * @param id the id
 * @returns the row
 */
const rowOf = (rows: CompareRow[], id: string) => rows.find(row => row.id === id) as CompareRow

it('compares with a file that misses some of the vehicle\'s parameters and has some the vehicle lacks', () => {
  // RTL_ALT differs, FENCE_ENABLE and ATC_RAT_PIT_P are the same (0.135 is the float the vehicle holds), NOT_A_PARAM and
  // OLD_THING are only in the file, and the rest of the vehicle's are not in it.
  const rows = rowsOfFile('RTL_ALT,2000\nFENCE_ENABLE,0\nNOT_A_PARAM,1\nATC_RAT_PIT_P,0.135\nOLD_THING,3\n')

  expect(rows.map(row => row.id)).toEqual([...VEHICLE_PARAMS.map(param => param.id), 'NOT_A_PARAM', 'OLD_THING'])
  expect(rowOf(rows, 'RTL_ALT')).toMatchObject({
    status: 'differs', other: 2000, change: { id: 'RTL_ALT', from: 1500, to: 2000, problem: null },
  })
  expect(rowOf(rows, 'FENCE_ENABLE')).toMatchObject({ status: 'same', other: 0, change: null })
  expect(rowOf(rows, 'ATC_RAT_PIT_P').status).toBe('same')
  expect(rowOf(rows, 'BATT_CAPACITY')).toMatchObject({ status: 'vehicleOnly', other: null, change: null })
  expect(rowOf(rows, 'OLD_THING')).toMatchObject({
    status: 'otherOnly', param: null, other: 3, change: { problem: 'not on this vehicle' },
  })
  expect(countsOf(rows)).toEqual({ same: 2, differs: 1, vehicleOnly: VEHICLE_PARAMS.length - 3, otherOnly: 2 })
  // Only what differs and can be made is copied across.
  expect(rows.filter(copyable).map(row => row.id)).toEqual(['RTL_ALT'])
})

it('takes the last value of a name the file has twice, as ArduPilot does', () => {
  const rows = rowsOfFile('RTL_ALT,2000\nRTL_ALT,1500\n')

  expect(rowOf(rows, 'RTL_ALT').status).toBe('same')
  expect(rows.filter(row => row.id === 'RTL_ALT')).toHaveLength(1)
})

it('does not copy a read-only parameter, and says why', () => {
  const metadata: Metadata = new Map([['SYSID_THISMAV', { readOnly: true }]])
  const side = defaultsSide([{ id: 'SYSID_THISMAV', value: 2 }])

  const [row] = compareValues(side.wanted, VEHICLE_PARAMS, { metadata }).filter(found => found.id === 'SYSID_THISMAV')

  expect(row?.status).toBe('differs')
  expect(row?.change?.problem).toBe('read-only: the vehicle sets it itself')
  expect(copyable(row as CompareRow)).toBe(false)
})

it('compares with the firmware defaults the vehicle gives', () => {
  const side = defaultsSide([{ id: 'BATT_CAPACITY', value: 3300 }, { id: 'RTL_ALT', value: 1500 }])

  expect(side.source).toEqual({ kind: 'defaults' })
  const rows = compareValues(side.wanted, PARAMS)
  expect(rowOf(rows, 'BATT_CAPACITY')).toMatchObject({ status: 'differs', other: 3300, change: { to: 3300 } })
  expect(rowOf(rows, 'RTL_ALT').status).toBe('same')
})

it('compares with a snapshot of another vehicle, and says it is another', () => {
  const other = { ...VEHICLE, type: 'FIXED_WING' }
  const snapshot = saveSnapshot(PARAMS.map(param => (param.id === 'RTL_ALT' ? { ...param, value: 3000 } : param)), other)

  const side = sideOfText(snapshot, { ...VEHICLE })

  expect(typeof side).toBe('object')

  if (typeof side === 'object') {
    expect(side.source.kind).toBe('snapshot')
    expect(side.vehicleWarning).toContain('FIXED_WING')
    expect(compareValues(side.wanted, PARAMS).filter(row => row.status !== 'same').map(row => row.id)).toEqual(['RTL_ALT'])
  }
})

it('says why a text is not something to compare with, and keeps the notes of a file', () => {
  expect(sideOfText('nothing here\n', undefined)).toBe('no parameter lines in it (NAME,VALUE or NAME VALUE, one per line)')
  expect(sideOfText('{"format":"something else"}', undefined)).toBe('not a Drone Configurator parameter snapshot')

  const side = sideOfText('RTL_ALT,1\nRTL_ALT,2\n', undefined)
  expect(typeof side === 'object' && side.notes).toEqual(['RTL_ALT is on lines 1, 2: the value on line 2 is used.'])
})

it('shows only the differences, a group and what a search finds', () => {
  const rows = rowsOfFile('RTL_ALT,2000\nFENCE_ENABLE,0\nFENCE_RADIUS,300\nNOT_A_PARAM,1\n')
  const shown = (filter: Partial<CompareFilter>, describe?: (id: string) => string) => rows
    .filter(row => rowShows(row, { onlyDifferences: true, group: '', search: '', ...filter }, describe))
    .map(row => row.id)

  expect(shown({})).not.toContain('FENCE_ENABLE')
  expect(shown({ onlyDifferences: false })).toContain('FENCE_ENABLE')
  expect(shown({ group: 'FENCE' })).toEqual(['FENCE_RADIUS'])
  expect(shown({ group: 'FENCE', onlyDifferences: false })).toEqual(['FENCE_ENABLE', 'FENCE_RADIUS'])
  expect(shown({ search: ' rtl ' })).toEqual(['RTL_ALT'])
  expect(shown({ search: 'return' }, id => (id === 'RTL_ALT' ? 'Return to launch altitude' : ''))).toEqual(['RTL_ALT'])
})

it('shows a value with its name or its units from the metadata, and a REAL32 short', () => {
  expect(valueText(1, { values: { 0: 'Disabled', 1: 'Enabled' } })).toBe('Enabled (1)')
  expect(valueText(2, { values: { 0: 'Disabled', 1: 'Enabled' } })).toBe('2')
  expect(valueText(1500, { units: 'cm' })).toBe('1500 cm')
  expect(valueText(Math.fround(0.135), undefined)).toBe('0.135')
  expect(valueText(null, { units: 'cm' })).toBe('')
})
