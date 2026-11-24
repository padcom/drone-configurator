import { expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { diffValues } from './paramDiff'
import { parseParamFile } from './paramFile'
import { MALFORMED_LISTED, fileNotes, reviewFile } from './paramFileReview'

/** The mock vehicle's list with a REAL32 as the wire gives it. */
const VEHICLE_PARAMS: Param[] = [
  ...PARAMS,
  { id: 'ATC_RAT_PIT_P', index: 50, kind: 'real', type: 'REAL32', value: Math.fround(0.135) },
]

it('lists what differs, reports the names the vehicle lacks, and counts what is the same already', () => {
  const file = parseParamFile('RTL_ALT,2000\r\nFENCE_ENABLE,0\r\nNOT_A_PARAM,1\r\nATC_RAT_PIT_P,0.135\r\n')

  const r = reviewFile(file, VEHICLE_PARAMS, { ...VEHICLE })

  expect(r.source).toEqual({ kind: 'file', format: 'param' })
  expect(r.changes).toEqual([
    { id: 'RTL_ALT', from: 1500, to: 2000, problem: null, warning: null },
    { id: 'NOT_A_PARAM', from: null, to: 1, problem: 'not on this vehicle', warning: null },
  ])
  // 0.135 in the file is the float the vehicle holds for it: the same.
  expect(r.unchanged).toBe(2)
  expect(r.vehicleWarning).toBeNull()
  expect(r.notes).toEqual([])
})

it('does not apply a line of a QGroundControl file that is for another component, and says why', () => {
  const file = parseParamFile('1\t1\tRTL_ALT\t2000\t6\n1\t154\tFENCE_ENABLE\t1\t2\n')

  expect(reviewFile(file, PARAMS, { ...VEHICLE }).changes).toEqual([
    { id: 'RTL_ALT', from: 1500, to: 2000, problem: null, warning: null },
    {
      id: 'FENCE_ENABLE',
      from: 0,
      to: 1,
      problem: 'for component 154 in the file; the autopilot is component 1',
      warning: null,
    },
  ])
})

it('takes the value of a QGroundControl line whatever type it names: the vehicle\'s type is what it is checked against', () => {
  const file = parseParamFile('1\t1\tRTL_ALT\t2000\t9\n1\t1\tFENCE_ENABLE\t300\t6\n')

  expect(reviewFile(file, PARAMS, { ...VEHICLE }).changes.map(change => [change.id, change.problem])).toEqual([
    ['RTL_ALT', null],
    ['FENCE_ENABLE', 'INT8 goes from -128 to 127'],
  ])
})

it('skips a read-only parameter, and FORMAT_VERSION always, and warns of a value outside the metadata\'s range', () => {
  const params: Param[] = [...PARAMS, { id: 'FORMAT_VERSION', index: 60, kind: 'int', type: 'INT16', value: 120 }]
  const file = parseParamFile('FORMAT_VERSION 13\nBATT_CAPACITY 1\nRTL_ALT 900000\n')
  const metadata = new Map([['RTL_ALT', { min: 200, max: 300000, units: 'cm' }], ['BATT_CAPACITY', { readOnly: true }]])

  expect(reviewFile(file, params, { ...VEHICLE }, { metadata }).changes).toEqual([
    { id: 'FORMAT_VERSION', from: 120, to: 13, problem: 'read-only: the vehicle sets it itself', warning: null },
    { id: 'BATT_CAPACITY', from: 5200, to: 1, problem: 'read-only: the vehicle sets it itself', warning: null },
    { id: 'RTL_ALT', from: 1500, to: 900000, problem: null, warning: 'Outside the usual range 200–300000 cm' },
  ])
})

it('counts a read-only parameter that is the same already as unchanged, not as a row', () => {
  const metadata = new Map([['BATT_CAPACITY', { readOnly: true }]])
  const r = reviewFile(parseParamFile('BATT_CAPACITY 5200\n'), PARAMS, undefined, { metadata })

  expect([r.changes, r.unchanged]).toEqual([[], 1])
})

it('says which names are in the file twice, and which lines are not parameters, the first few by number', () => {
  const bad = Array.from({ length: MALFORMED_LISTED + 2 }, (_, index) => `junk ${index} here`)
  const file = parseParamFile(['RTL_ALT,1', 'RTL_ALT,2', ...bad].join('\n'))

  const notes = fileNotes(file)

  expect(notes[0]).toBe('RTL_ALT is on lines 1, 2: the value on line 2 is used.')
  expect(notes[1]).toBe('Line 3 is not a parameter, left out: junk 0 here')
  expect(notes).toHaveLength(1 + MALFORMED_LISTED + 1)
  expect(notes.at(-1)).toBe('2 more lines are not parameters.')
  expect(fileNotes(parseParamFile(['x y z', ...bad].join('\n'))).at(-1)).toBe('3 more lines are not parameters.')
  const oneMore = parseParamFile(bad.slice(0, MALFORMED_LISTED + 1).join('\n'))
  expect(fileNotes(oneMore).at(-1)).toBe('1 more line is not a parameter.')
})

it('keeps the order of the wanted values, and treats a value as the number the vehicle holds', () => {
  const wanted = [{ id: 'WPNAV_SPEED', value: 800 }, { id: 'RTL_ALT', value: 1500.4 }, { id: 'ARMING_CHECK', value: 0 }]
  const d = diffValues(wanted, PARAMS)

  expect(d.changes.map(change => [change.id, change.to])).toEqual([['WPNAV_SPEED', 800], ['ARMING_CHECK', 0]])
  expect(d.unchanged).toBe(1)
})

it('says a value too large for a REAL32 is so', () => {
  expect(diffValues([{ id: 'WPNAV_SPEED', value: 1e40 }], PARAMS).changes[0]?.problem).toBe('too large for a REAL32')
})

it('holds a kind or type that differs against the change only when the source says one', () => {
  expect(diffValues([{ id: 'RTL_ALT', value: 2, kind: 'real', type: 'REAL32' }], PARAMS).changes[0]?.problem)
    .toBe('REAL32 in the snapshot, INT32 on the vehicle')
  expect(diffValues([{ id: 'RTL_ALT', value: 2 }], PARAMS).changes[0]?.problem).toBeNull()
})
