// The line in Settings about where the metadata in use came from.
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { formatFor } from '@/i18n/useFormat'
import type { DownloadedMetadata } from '@/composables/useMetadata'
import { type MetadataState, metadataStatus } from './metadataStatus'

const t = (key: string, named?: Record<string, unknown>) => i18n.global.t(key, named ?? {})
const f = formatFor('en')
const AT = Date.UTC(2026, 10, 20, 12, 0)
const DATE = f.dateTime(new Date(AT))

const NO_RELEASE = 'the vehicle did not report a released firmware version.'
const NOTHING_YET = 'Nothing downloaded yet. It is downloaded when a vehicle is connected.'

const GOT: DownloadedMetadata = {
  vehicle: 'copter', version: '4.7.1', exact: true, fromCache: false, stale: false, fetchedAt: AT, loadMs: 1234, count: 1400,
}

/**
 * The line for a state.
 *
 * @param state what differs from a download that worked
 * @returns the line
 */
function line(state: Partial<MetadataState>): string {
  return metadataStatus({ source: 'download', downloaded: GOT, downloadError: null, downloading: false, ...state }, t, f)
}

describe('the line about the metadata in use', () => {
  it('names the vehicle, the version and the date of a version\'s file', () => {
    expect(line({})).toBe(`Copter 4.7.1 metadata from ArduPilot, downloaded ${DATE}.`)
  })

  it('says why the latest file is used', () => {
    expect(line({ downloaded: { ...GOT, exact: false, version: '4.7.3' } }))
      .toBe(`Latest Copter metadata from ArduPilot, downloaded ${DATE}: ArduPilot has none for 4.7.3.`)
    expect(line({ downloaded: { ...GOT, vehicle: 'tracker', exact: false, version: undefined } }))
      .toBe(`Latest Antenna Tracker metadata from ArduPilot, downloaded ${DATE}: ${NO_RELEASE}`)
  })

  it('says it came from this computer, how fast, and when it may be out of date', () => {
    expect(line({ downloaded: { ...GOT, fromCache: true, loadMs: 46 } }))
      .toBe(`Copter 4.7.1 metadata from ArduPilot, downloaded ${DATE}. Loaded from this computer in 0.05 s.`)
    expect(line({ downloaded: { ...GOT, exact: false, version: '4.8.0', fromCache: true, stale: true, loadMs: 120 } })).toBe(
      `Latest Copter metadata from ArduPilot, downloaded ${DATE}: ArduPilot has none for 4.8.0. `
      + 'Loaded from this computer in 0.12 s. ArduPilot\'s server could not be reached, so it may be out of date.',
    )
  })

  it('says a download runs, a file is in use, nothing was tried, or why nothing came', () => {
    expect(line({ downloading: true })).toBe('Downloading the parameter metadata…')
    expect(line({ downloading: true, progress: { received: 1_250_000, total: 2_329_019 } }))
      .toBe('Downloading the parameter metadata: 1.3 of 2.3 MB…')
    expect(line({ source: 'file' })).toBe('A file you loaded is in use. Nothing is downloaded while it is.')
    expect(line({ source: 'none', downloaded: null })).toBe(NOTHING_YET)
    expect(line({ source: 'none', downloaded: null, downloadError: 'the server cannot be reached' }))
      .toBe('Not downloaded: the server cannot be reached. Parameters are shown without descriptions.')
  })
})
