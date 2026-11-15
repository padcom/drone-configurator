// The words of the map: the credit that is always there for the built-in source (and what a source says of itself), and the one
// line about why tiles are missing, a switch before a failure and a failure before offline mode.
import { expect, it } from 'vitest'
import type { MapSources } from '@/generated/app'
import { OSM_CREDIT, chipOf, creditOf } from './mapText'

const say = (key: string, named?: Record<string, unknown>): string => (named ? `${key} ${JSON.stringify(named)}` : key)
const FINE = { enabled: true, offline: false, status: null, problems: [] }

it('credits OpenStreetMap, linked, before the backend has said anything, and what the backend says of the source after', () => {
  expect(OSM_CREDIT).toEqual({ text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' })
  expect(creditOf(null, 'osm')).toEqual(OSM_CREDIT)
  expect(creditOf(null, 'custom')).toEqual({ text: '', url: '' })

  const source = { name: 'Source', allowOffline: false, custom: false }
  const info = {
    sources: [
      { ...source, id: 'osm', attribution: '© OSM', attributionUrl: 'https://osm.example/c' },
      { ...source, id: 'custom', attribution: 'Tiles by me', attributionUrl: 'https://me.example', custom: true },
    ],
  } as MapSources

  expect(creditOf(info, 'osm')).toEqual({ text: '© OSM', url: 'https://osm.example/c' })
  expect(creditOf(info, 'custom')).toEqual({ text: 'Tiles by me', url: 'https://me.example' })
})

it('says nothing when the tiles are fine', () => {
  expect(chipOf(FINE, say)).toBe('')
})

it('says the switch is off before anything else, then that the server asked to slow down', () => {
  const failing = { ...FINE, problems: ['UNAVAILABLE'], offline: true }

  expect(chipOf({ ...failing, enabled: false }, say)).toBe('map.chip.disabled')
  expect(chipOf({ ...failing, status: { state: 'backing-off' } }, say)).toBe('map.chip.backingOff')
})

it('says why tiles are missing: none kept offline, the backend\'s reason, and nothing of a tile that is not there', () => {
  expect(chipOf({ ...FINE, offline: true, problems: ['OFFLINE_MISS'] }, say)).toContain('map.chip.offlineMiss')
  expect(chipOf({ ...FINE, problems: ['UNAVAILABLE'], status: { state: 'online', reason: 'no route' } }, say))
    .toBe('map.chip.unavailable {"reason":"no route"}')
  expect(chipOf({ ...FINE, problems: ['UNAVAILABLE'] }, say)).toBe('map.chip.unavailable {"reason":"UNAVAILABLE"}')
  expect(chipOf({ ...FINE, problems: ['NOT_FOUND'] }, say)).toBe('')
  expect(chipOf({ ...FINE, offline: true }, say)).toBe('map.chip.offline')
})
