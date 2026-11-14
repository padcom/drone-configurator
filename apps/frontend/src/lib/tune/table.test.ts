import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { RATE_AXES, RATE_TERMS, TUNE_PARAMS, partnerOf, rateId, refusalOf, tableMeta, tuneGroup, tuneParam } from './table'

/**
 * A row of the backend's list, as the regular expression found it.
 *
 * @param match the match
 * @returns the name, the least, the greatest, and whether armed is fine
 */
function backendRow(match: RegExpMatchArray): readonly [string, number, number, boolean] {
  const { id, min, max, ok } = match.groups as Record<string, string>

  return [id ?? '', Number(min), Number(max), ok === 'true']
}

/** The parameters that the vehicle reads only when it starts. */
const STARTUP = ['INS_HNTCH_ENABLE', 'INS_HNTCH_MODE', 'INS_HNTCH_REF', 'INS_HNTCH_HMNCS', 'INS_HNTCH_OPTS']

/**
 * The least of the range of a parameter of the table.
 *
 * @param id the name
 * @returns its least
 */
function least(id: string): number {
  return tuneParam(id)?.lo ?? 0
}

it('has each name once, no wildcard, and a range that holds a value', () => {
  const ids = TUNE_PARAMS.map(param => param.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids.every(id => /^[A-Z0-9_]+$/.test(id))).toBe(true)
  expect(TUNE_PARAMS.every(param => param.lo >= 0 && param.hi > param.lo && param.step > 0)).toBe(true)
})

it('agrees, name by name and limit by limit, with the list the backend holds every tuning write to', () => {
  const source = readFileSync(resolve(process.cwd(), '../backend/tuning.pi'), 'utf8')
  const backend = [...source.matchAll(
    /Tunable \{ id: "(?<id>[A-Z0-9_]+)", min: (?<min>[0-9.]+), max: (?<max>[0-9.]+), armedOk: (?<ok>true|false) \}/g,
  )].map(backendRow)

  expect(backend.map(([id]) => id)).toEqual(TUNE_PARAMS.map(param => param.id))
  expect(backend.map(([, min]) => min)).toEqual(TUNE_PARAMS.map(param => param.lo))
  expect(backend.map(([, , max]) => max)).toEqual(TUNE_PARAMS.map(param => param.hi))
  expect(backend.map(([, , , armedOk]) => armedOk)).toEqual(TUNE_PARAMS.map(param => param.armedOk))
})

it('has the groups of the page: the rate loop, attitude, pilot feel, position and the radio knob', () => {
  expect(tuneGroup('rate')).toHaveLength(12)
  expect(tuneGroup('attitude').map(param => param.id)).toEqual(['ATC_ANG_RLL_P', 'ATC_ANG_PIT_P', 'ATC_ANG_YAW_P'])
  expect(tuneGroup('feel')).toHaveLength(7)
  expect(tuneGroup('position')).toHaveLength(8)
  expect(tuneGroup('knob').map(param => param.kind)).toEqual(['choice'])
})

it('names the rate parameters of each axis and term, and links roll with pitch, never yaw', () => {
  expect(RATE_AXES.flatMap(axis => RATE_TERMS.map(term => rateId(axis, term)))).toEqual(tuneGroup('rate').map(param => param.id))
  expect(partnerOf('RLL')).toBe('PIT')
  expect(partnerOf('PIT')).toBe('RLL')
  expect(partnerOf('YAW')).toBeNull()
})

it('refuses a negative value, a value above the most of the table, and what is not a number, and takes the ends', () => {
  expect(refusalOf('ATC_RAT_RLL_P', -0.001)).toBe('negative')
  expect(refusalOf('ATC_RAT_RLL_P', 0.5001)).toBe('above')
  expect(refusalOf('ATC_RAT_RLL_P', Number.NaN)).toBe('nan')
  expect(refusalOf('ATC_RAT_RLL_P', Number.POSITIVE_INFINITY)).toBe('nan')
  expect(refusalOf('ATC_RAT_RLL_P', 0.5)).toBeNull()
  expect(refusalOf('ATC_RAT_RLL_P', 0)).toBeNull()
  // below the least of the table: only warned about disarmed, refused armed, and the least itself is allowed
  expect(refusalOf('ATC_RAT_RLL_P', 0, false)).toBeNull()
  expect(refusalOf('ATC_RAT_RLL_P', 0, true)).toBe('below')
  expect(refusalOf('ATC_RAT_RLL_P', 0.01, true)).toBeNull()
  // a name that is not the Tune screen's is refused whatever the value
  expect(refusalOf('ARMING_CHECK', 1)).toBe('nan')
})

it('refuses a value below the least of the range while armed, for each of the names that have a least above zero', () => {
  const bounded = TUNE_PARAMS.filter(param => param.lo > 0)

  expect(bounded.length).toBeGreaterThan(10)

  for (const param of bounded) {
    expect(refusalOf(param.id, 0, true)).toBe('below')
    expect(refusalOf(param.id, 0, false)).toBeNull()
    expect(refusalOf(param.id, param.lo, true)).toBeNull()
  }
})

it('has the filters: the gyro filter, and the notch with what is read at start-up marked as needing a reboot', () => {
  expect(tuneGroup('gyro').map(param => param.id)).toEqual(['INS_GYRO_FILTER'])
  expect(tuneGroup('notch').map(param => param.id)).toEqual([
    'INS_HNTCH_ENABLE',
    'INS_HNTCH_MODE',
    'INS_HNTCH_REF',
    'INS_HNTCH_FREQ',
    'INS_HNTCH_BW',
    'INS_HNTCH_ATT',
    'INS_HNTCH_HMNCS',
    'INS_HNTCH_OPTS',
  ])
  expect(TUNE_PARAMS.filter(param => !param.armedOk).map(param => param.id)).toEqual(STARTUP)
})

it('refuses a parameter that is read at start-up while armed, and takes it disarmed; the live ones are taken armed', () => {
  for (const id of STARTUP) {
    expect(refusalOf(id, 1, true)).toBe('reboot')
    expect(refusalOf(id, 1, false)).toBeNull()
  }

  for (const id of ['INS_HNTCH_FREQ', 'INS_HNTCH_BW', 'INS_HNTCH_ATT', 'INS_GYRO_FILTER']) {
    expect(refusalOf(id, least(id), true)).toBeNull()
  }
  // a value beyond the limits is said first, whatever the parameter needs
  expect(refusalOf('INS_HNTCH_MODE', 6, true)).toBe('above')
  expect(refusalOf('INS_HNTCH_FREQ', 9, true)).toBe('below')
  expect(refusalOf('INS_GYRO_FILTER', 0, true)).toBe('below')
  expect(refusalOf('INS_GYRO_FILTER', 0, false)).toBeNull()
})

it('says the range of a parameter in the shape of the metadata, with its unit when it has one', () => {
  expect(tableMeta(tuneParam('ATC_RAT_RLL_P')!)).toEqual({ min: 0.01, max: 0.5 })
  expect(tableMeta(tuneParam('ATC_RATE_R_MAX')!)).toEqual({ min: 0, max: 1080, units: 'deg/s' })
})
