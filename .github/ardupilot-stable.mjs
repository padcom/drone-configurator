// The newest stable ArduPilot release of the family the pinned ref is from (.github/ardupilot-ref: `Copter-4.7.2` is of the
// family `Copter`, whose stable releases are `Copter-X.Y.Z`; betas and release candidates have a suffix and are not stable). The
// scheduled job sitl-next-stable.yml runs the SITL suites at it and reports what breaks before the pin is moved. Plain Node, no
// dependencies; the pure functions are unit-tested in apps/frontend/e2e/ardupilot-stable.test.ts.
//
// Usage: node .github/ardupilot-stable.mjs   (prints `pinned=`, `ref=` and `newer=` lines, for $GITHUB_OUTPUT)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RELEASE = /^(?<family>[A-Za-z]+)-(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u

/**
 * A stable release tag's family and version.
 *
 * @param {string} tag a tag of ArduPilot's repository
 * @returns {{ family: string, version: number[] } | null} null for anything but a stable release (a beta, a commit, a branch)
 */
export function releaseOf(tag) {
  const match = RELEASE.exec(tag)
  if (!match?.groups) return null
  const { family, major, minor, patch } = match.groups
  return { family, version: [major, minor, patch].map(Number) }
}

/**
 * Compares two versions, part by part.
 *
 * @param {number[]} a a version
 * @param {number[]} b another
 * @returns {number} below 0 when a is older, above 0 when it is newer, 0 when they are the same
 */
export function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * The newest stable release of a family among some tags.
 *
 * @param {string[]} tags tag names
 * @param {string} family `Copter`, `Plane`, ...
 * @returns {string | null} the tag, or null when the family has none
 */
export function newestStable(tags, family) {
  const releases = tags.map(tag => ({ tag, release: releaseOf(tag) })).filter(({ release }) => release?.family === family)
  releases.sort((a, b) => compareVersions(b.release.version, a.release.version))
  return releases[0]?.tag ?? null
}

/**
 * What the scheduled job needs to know: the pin, the newest stable of its family, and whether that is newer.
 *
 * @param {string} pinned the pinned ref
 * @param {string[]} tags the repository's tags
 * @returns {{ pinned: string, ref: string, newer: boolean }} the newest stable (the pin itself when it is not a release)
 */
export function nextStable(pinned, tags) {
  const release = releaseOf(pinned)
  const newest = release ? newestStable(tags, release.family) : null
  if (!release || !newest) return { pinned, ref: pinned, newer: false }
  return { pinned, ref: newest, newer: compareVersions(releaseOf(newest).version, release.version) > 0 }
}

/**
 * ArduPilot's tags of a family, from GitHub.
 *
 * @param {string} family the family
 * @returns {string[]} the tag names
 */
function remoteTags(family) {
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', 'https://github.com/ArduPilot/ardupilot.git', `refs/tags/${family}-*`],
    { encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map(line => line.split('\t')[1].replace('refs/tags/', ''))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pinned = readFileSync(new URL('ardupilot-ref', import.meta.url), 'utf8').trim()
  const release = releaseOf(pinned)
  const next = nextStable(pinned, release ? remoteTags(release.family) : [])
  console.log(`pinned=${next.pinned}\nref=${next.ref}\nnewer=${next.newer}`)
}
