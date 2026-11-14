import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { RATE_AXES, RATE_TERMS, TUNE_PARAMS, partnerOf, rateId, refusalOf, tableMeta, tuneGroup, tuneParam } from './table'

it('has each name once, no wildcard, and a range that holds a value', () => {
  const ids = TUNE_PARAMS.map(param => param.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids.every(id => /^[A-Z0-9_]+$/.test(id))).toBe(true)
  expect(TUNE_PARAMS.every(param => param.lo >= 0 && param.hi > param.lo && param.step > 0)).toBe(true)
})

it('agrees, name by name and limit by limit, with the list the backend holds every tuning write to', () => {
  const source = readFileSync(resolve(process.cwd(), '../backend/tuning.pi'), 'utf8')
  const backend = [...source.matchAll(/Tunable \{ id: "(?<id>[A-Z0-9_]+)", max: (?<max>[0-9.]+) \}/g)]
    .map(match => [match.groups?.id, Number(match.groups?.max)] as const)

  expect(backend.map(([id]) => id)).toEqual(TUNE_PARAMS.map(param => param.id))
  expect(backend.map(([, max]) => max)).toEqual(TUNE_PARAMS.map(param => param.hi))
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
  // a name that is not the Tune screen's is refused whatever the value
  expect(refusalOf('ARMING_CHECK', 1)).toBe('nan')
})

it('says the range of a parameter in the shape of the metadata, with its unit when it has one', () => {
  expect(tableMeta(tuneParam('ATC_RAT_RLL_P')!)).toEqual({ min: 0.01, max: 0.5 })
  expect(tableMeta(tuneParam('ATC_RATE_R_MAX')!)).toEqual({ min: 0, max: 1080, units: 'deg/s' })
})
