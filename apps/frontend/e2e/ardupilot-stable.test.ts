// @vitest-environment node
// The choice of the next ArduPilot stable for the scheduled SITL job (.github/ardupilot-stable.mjs): only stable releases of the
// pin's own family, compared as versions (4.10 is newer than 4.9), and nothing to do while the pin is the newest.
import { describe, expect, it } from 'vitest'
import { compareVersions, newestStable, nextStable, releaseOf } from '../../../.github/ardupilot-stable.mjs'

const TAGS = [
  'Copter-4.6.3',
  'Copter-4.7.0-beta1',
  'Copter-4.7.0-rc2',
  'Copter-4.7.2',
  'Copter-4.7.3',
  'Copter-4.10.0-beta1',
  'Plane-4.6.2',
  'ArduCopter-stable',
  'Copter-stable',
]

describe('a release tag', () => {
  it('is a family and three numbers; betas, candidates and moving tags are not stable releases', () => {
    expect(releaseOf('Copter-4.7.2')).toEqual({ family: 'Copter', version: [4, 7, 2] })
    expect(releaseOf('Copter-4.7.0-beta1')).toBeNull()
    expect(releaseOf('Copter-stable')).toBeNull()
    expect(releaseOf('fb773567896014da007bca58358704d4a0d8516f')).toBeNull()
  })

  it('compares as versions, not as text', () => {
    expect(compareVersions([4, 10, 0], [4, 9, 9])).toBeGreaterThan(0)
    expect(compareVersions([4, 7, 2], [4, 7, 2])).toBe(0)
    expect(compareVersions([4, 6, 3], [4, 7, 0])).toBeLessThan(0)
  })
})

describe('the next stable', () => {
  it('is the newest stable release of the same family', () => {
    expect(newestStable(TAGS, 'Copter')).toBe('Copter-4.7.3')
    expect(newestStable(TAGS, 'Plane')).toBe('Plane-4.6.2')
    expect(newestStable(TAGS, 'Rover')).toBeNull()
  })

  it('is newer than the pin, or there is nothing to run', () => {
    expect(nextStable('Copter-4.7.2', TAGS)).toEqual({ pinned: 'Copter-4.7.2', ref: 'Copter-4.7.3', newer: true })
    expect(nextStable('Copter-4.7.3', TAGS)).toEqual({ pinned: 'Copter-4.7.3', ref: 'Copter-4.7.3', newer: false })
  })

  it('is the pin itself when the pin is a commit', () => {
    const commit = 'fb773567896014da007bca58358704d4a0d8516f'

    expect(nextStable(commit, TAGS)).toEqual({ pinned: commit, ref: commit, newer: false })
  })
})
