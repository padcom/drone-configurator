// The grouping by the metadata (#36): the group ArduPilot's definitions have a parameter in.
import { expect, it } from 'vitest'
import type { Param } from '@/generated/app'
import type { ParamMeta } from './metadata'
import {
  OTHER,
  RECENT_GROUP,
  effectiveGroup,
  groupOf,
  groupsOf,
  hasMetadataGroups,
  inGroup,
  metadataGrouping,
} from './paramGroups'
import { relatedTo } from './paramEditor'
import { visibleParams } from './paramList'

const p = (id: string): Param => ({ id, index: 0, kind: 'int', type: 'INT32', value: 0 })
const PARAMS = ['FLTMODE1', 'FS_THR_ENABLE', 'INS_ACCOFFS_X', 'INS_HNTCH_ENABLE', 'INS_HNTCH_FREQ', 'SR0_POSITION'].map(p)
const META = new Map<string, ParamMeta>([
  ['FLTMODE1', { group: 'ArduCopter' }],
  ['FS_THR_ENABLE', { group: 'ArduCopter' }],
  ['INS_ACCOFFS_X', { group: 'INS' }],
  ['INS_HNTCH_ENABLE', { group: 'INS_HNTCH_' }],
  ['INS_HNTCH_FREQ', { group: 'INS_HNTCH_' }],
])
const byMetadata = metadataGrouping(META)

it('groups by the library or the vehicle the metadata has a parameter in, without the underscore at its end', () => {
  expect(groupsOf(PARAMS, PARAMS, byMetadata)).toEqual([
    { id: 'ArduCopter', count: 2 },
    { id: 'INS', count: 1 },
    { id: 'INS_HNTCH', count: 2 },
    { id: OTHER, count: 1 },
  ])
  // By the name, as before.
  expect(groupsOf(PARAMS).map(group => group.id)).toEqual(['FS', 'INS', 'SR0', OTHER])
})

it('lists, chooses and relates by the grouping in force', () => {
  expect(visibleParams(PARAMS, '', 'ArduCopter', byMetadata).map(param => param.id)).toEqual(['FLTMODE1', 'FS_THR_ENABLE'])
  expect(inGroup('INS_HNTCH_FREQ', 'INS', byMetadata)).toBe(false)
  expect(inGroup('INS_HNTCH_FREQ', 'INS', groupOf)).toBe(true)
  expect(effectiveGroup(PARAMS, 'ArduCopter', byMetadata)).toBe('ArduCopter')
  expect(effectiveGroup(PARAMS, 'ArduCopter')).toBe('')
  expect(effectiveGroup(PARAMS, RECENT_GROUP)).toBe(RECENT_GROUP)
  expect(relatedTo(PARAMS, 'FLTMODE1', byMetadata)).toEqual(['FS_THR_ENABLE'])
  expect(relatedTo(PARAMS, 'SR0_POSITION', byMetadata)).toEqual([])
})

it('is offered only when the metadata has groups', () => {
  expect(hasMetadataGroups(META)).toBe(true)
  expect(hasMetadataGroups(new Map([['A', { description: 'x' }]]))).toBe(false)
})
