// The review of a parameter file and the comparison with one, when the file is from an older firmware (#202).
import { expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import { translate } from '@/testing/testing'
import { cellsOf } from './compareView'
import { compareValues, countsOf } from './paramCompare'
import { parseParamFile } from './paramFile'
import { reviewFile } from './paramFileReview'
import { RENAME_GROUPS } from './renameTable'
import { renameContext, renameTable } from './renames'
import { renamedWords } from './renameWords'

const renames = renameContext(renameTable(RENAME_GROUPS), 'copter', '4.7.2')

/** A Copter of 4.7: RTL_ALT is RTL_ALT_M (in metres), WPNAV_SPEED is WP_SPD (in m/s), ARMING_CHECK is ARMING_SKIPCHK. */
const COPTER_47: Param[] = [
  { id: 'RTL_ALT_M', index: 0, kind: 'real', type: 'REAL32', value: 15 },
  { id: 'WP_SPD', index: 1, kind: 'real', type: 'REAL32', value: 10 },
  { id: 'ARMING_SKIPCHK', index: 2, kind: 'int', type: 'INT32', value: 0 },
  { id: 'BATT_CAPACITY', index: 3, kind: 'int', type: 'INT32', value: 5200 },
]

/** A file saved from a Copter of 4.6. */
const FILE_46 = parseParamFile('RTL_ALT,3000\nWPNAV_SPEED,1000\nARMING_CHECK,1\nBATT_CAPACITY,3300\nRTL_SPEED,500\n')

it('offers a renamed parameter under its new name in the review, converted, instead of a plain miss', () => {
  const review = reviewFile(FILE_46, COPTER_47, undefined, { renames })

  expect(review.changes).toEqual([
    {
      id: 'RTL_ALT_M', from: 15, to: 30, problem: null, warning: null,
      renamed: { from: 'RTL_ALT', since: '4.7', value: 3000, units: { from: 'cm', to: 'm' } },
    },
    { id: 'BATT_CAPACITY', from: 5200, to: 3300, problem: null, warning: null },
    // The firmware has renamed it too, but this vehicle has neither name: a plain miss.
    { id: 'RTL_SPEED', from: null, to: 500, problem: 'not on this vehicle', warning: null },
  ])
  // 1000 cm/s is the 10 m/s the vehicle has, and ARMING_CHECK 1 (all checks) is ARMING_SKIPCHK 0 (none skipped).
  expect(review.unchanged).toBe(2)
})

it('reports the old names as not on the vehicle without the renames', () => {
  const review = reviewFile(FILE_46, COPTER_47, undefined)

  expect(review.changes.filter(change => change.problem !== null).map(change => change.id))
    .toEqual(['RTL_ALT', 'WPNAV_SPEED', 'ARMING_CHECK', 'RTL_SPEED'])
})

it('says the old and the new name with the release, and both values when the firmware converts it', () => {
  const [rtl] = reviewFile(FILE_46, COPTER_47, undefined, { renames }).changes
  if (!rtl?.renamed) {
    throw new Error('RTL_ALT was not renamed')
  }

  expect(renamedWords(rtl.id, rtl.to, rtl.renamed, translate))
    .toEqual({ name: 'RTL_ALT → RTL_ALT_M (renamed in 4.7)', value: 'Converted: 3000 cm → 30 m' })
  // Kept as it is: no conversion to show.
  expect(renamedWords('GPS1_TYPE', 1, { from: 'GPS_TYPE', since: '4.6', value: 1 }, translate))
    .toEqual({ name: 'GPS_TYPE → GPS1_TYPE (renamed in 4.6)', value: null })
})

it('compares the file under the vehicle\'s names, and says the old name and value beside the new', () => {
  const file = FILE_46.entries.map(entry => ({ id: entry.id, value: entry.value }))
  const rows = compareValues(file, COPTER_47, { renames })

  expect(rows.map(row => [row.id, row.status, row.other])).toEqual([
    ['RTL_ALT_M', 'differs', 30],
    ['WP_SPD', 'same', 10],
    ['ARMING_SKIPCHK', 'same', 0],
    ['BATT_CAPACITY', 'differs', 3300],
    ['RTL_SPEED', 'otherOnly', 500],
  ])
  expect(countsOf(rows)).toEqual({ same: 2, differs: 2, vehicleOnly: 0, otherOnly: 1 })
  const [rtl] = rows
  if (!rtl) {
    throw new Error('no row')
  }
  expect(rtl.change?.renamed?.from).toBe('RTL_ALT')
  expect(cellsOf(rtl, { units: 'm' }, translate).other).toBe('30 m (was RTL_ALT 3000 cm, renamed in 4.7)')
})
