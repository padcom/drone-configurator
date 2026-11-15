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

it('says the switch is off before anything else, then that the tiles are paused, with the backend\'s reason and no time', () => {
  const failing = { ...FINE, problems: ['UNAVAILABLE'], offline: true }
  const paused = { state: 'backing-off', reason: 'the server answered 403', retryAfterMs: 300_000 } as const

  expect(chipOf({ ...failing, enabled: false }, say)).toBe('map.chip.disabled')
  expect(chipOf({ ...failing, status: paused }, say)).toBe('map.chip.backingOff {"reason":"the server answered 403"}')
  expect(chipOf({ ...failing, status: { state: 'backing-off' } }, say)).toBe('map.chip.backingOffPlain')
})

it('says why tiles are missing: none kept offline, the backend\'s reason, and nothing of a tile that is not there', () => {
  expect(chipOf({ ...FINE, offline: true, problems: ['OFFLINE_MISS'] }, say)).toContain('map.chip.offlineMiss')
  expect(chipOf({ ...FINE, problems: ['UNAVAILABLE'], status: { state: 'online', reason: 'no route' } }, say))
    .toBe('map.chip.unavailable {"reason":"no route"}')
  expect(chipOf({ ...FINE, problems: ['UNAVAILABLE'] }, say)).toBe('map.chip.code.UNAVAILABLE')
  expect(chipOf({ ...FINE, problems: ['NOT_FOUND'] }, say)).toBe('')

  // one short sentence for each code the map keeps, never a bare code
  for (const code of ['BAD_REQUEST', 'TOO_BIG', 'BAD_TYPE', 'RATE_LIMITED']) {
    expect(chipOf({ ...FINE, problems: [code] }, say)).toBe(`map.chip.code.${code}`)
  }
  expect(chipOf({ ...FINE, problems: ['SOMETHING_NEW'] }, say)).toBe('map.chip.generic')
  expect(chipOf({ ...FINE, offline: true }, say)).toBe('map.chip.offline')
})
