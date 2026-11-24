import { describe, expect, it } from 'vitest'
import { BackendError } from '@/backend/client'
import type { PresetsList } from '@/generated/app'
import { say } from '@/i18n/say'
import { PARAMS, VEHICLE } from '@/mock/fixtures'
import { freshnessLine, presetFolder, presetName, presetShows, presetsError, refLine, reviewPreset } from './framePresets'
import { sourceWords } from './snapshotImport'

// The presets here are made up for the tests: ArduPilot's own are GPL and never part of the repository.

/**
 * A list as the backend gives it.
 *
 * @param change what differs from master's, kept on this computer
 * @returns the list
 */
function listOf(change: Partial<PresetsList> = {}): PresetsList {
  return {
    vehicle: 'copter', ref: 'master', pinned: false, fallback: 'unreleased', presets: [], fromCache: false, stale: false,
    fetchedAt: 0, ...change,
  }
}

describe('a preset\'s name and folder', () => {
  it('is the file\'s name without its extension, and the folder above it', () => {
    expect(presetName('Holybro-Test.param')).toBe('Holybro-Test')
    expect(presetName('QuadPlanes/Made_Up.parm')).toBe('Made_Up')
    expect(presetName('Sub/made-up-4_0_0.params')).toBe('made-up-4_0_0')
    expect(presetFolder('QuadPlanes/Made_Up.parm')).toBe('QuadPlanes')
    expect(presetFolder('Holybro-Test.param')).toBe('')
  })
})

describe('the search', () => {
  const entry = { path: 'QuadPlanes/Made-Up_X500v2-bdshot.param', size: 1 }

  it.each([
    ['', true],
    ['x500', true],
    ['made up', true],
    ['quadplanes x500', true],
    ['MADE-UP', true],
    ['bdshot hexa', false],
    ['plane', true],
  ])('"%s" finds it: %s', (search, found) => {
    expect(presetShows(entry, search)).toBe(found)
  })
})

describe('what the page says of the list', () => {
  it('names the vehicle\'s firmware tag, or master and why', () => {
    expect(refLine(listOf({ ref: 'Copter-4.7.3', pinned: true, fallback: undefined, version: '4.7.3' }), say))
      .toBe('From ArduPilot Copter-4.7.3, the vehicle\'s firmware.')
    expect(refLine(listOf(), say)).toBe('From ArduPilot master: the vehicle did not report a released firmware version.')
    expect(refLine(listOf({ fallback: 'untagged', version: '4.9.9' }), say))
      .toBe('From ArduPilot master: ArduPilot has no tag for the vehicle\'s firmware 4.9.9.')
  })

  it('says when it is kept on this computer, and when it is stale', () => {
    expect(freshnessLine(listOf(), say)).toBe('')
    expect(freshnessLine(listOf({ fromCache: true }), say)).toBe('Kept on this computer.')
    expect(freshnessLine(listOf({ fromCache: true, stale: true }), say))
      .toBe('Kept on this computer: GitHub could not be asked for a newer list.')
  })
})

describe('why there is no list', () => {
  it('says that GitHub refuses, and until when when it said', () => {
    const until = new Date(2026, 10, 24, 14, 5).getTime() / 1000
    const time = new Date(until * 1000).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
    expect(presetsError(new BackendError('RATE_LIMITED', String(until)), say, 'en'))
      .toBe(`GitHub refuses more requests from this computer until ${time} (60 an hour without an account). Try again then.`)
    expect(time).toMatch(/05/u)
    expect(presetsError(new BackendError('RATE_LIMITED', ''), say, 'en')).toMatch(/^GitHub refuses more requests .* for now/u)
  })

  it('says what to do next for the rest', () => {
    expect(presetsError(new BackendError('NOT_CONNECTED', 'x'), say, 'en')).toBe('Connect to a vehicle first.')
    expect(presetsError(new BackendError('UNSUPPORTED_VEHICLE', 'x'), say, 'en'))
      .toBe('ArduPilot publishes frame presets for ArduPilot vehicles only.')
    expect(presetsError(new BackendError('UNAVAILABLE', 'the server cannot be reached'), say, 'en')).toBe(
      'Couldn\'t download from ArduPilot\'s GitHub: the server cannot be reached. Check the internet connection and try again.',
    )
  })
})

describe('what a preset would change', () => {
  const against = { params: PARAMS, vehicle: { ...VEHICLE }, options: {} }
  const source = { kind: 'preset', ref: 'Copter-4.7.3', path: 'Made-Up/Quad.param' } as const

  it('is a parameter file\'s review, CRLF and all, with the preset as its source', () => {
    const text = '# made up\r\nRTL_ALT,3000\r\nBATT_CAPACITY,5200\r\nNOT_ON_VEHICLE,1\r\n'

    const reviewed = reviewPreset(text, source, against)

    expect(reviewed?.source).toEqual(source)
    expect(reviewed?.unchanged).toBe(1)
    expect(reviewed?.changes.map(change => [change.id, change.from, change.to, change.problem])).toEqual([
      ['RTL_ALT', 1500, 3000, null],
      ['NOT_ON_VEHICLE', null, 1, 'not on this vehicle'],
    ])
    expect(sourceWords(source, say))
      .toEqual({ heading: 'Frame preset: Made-Up/Quad.param (ArduPilot Copter-4.7.3)', column: 'In the preset' })
  })

  it('is nothing for a text without parameter lines', () => {
    expect(reviewPreset('# only a comment\r\n', source, against)).toBeNull()
  })
})
