// The track of the mock's flights (the contract's `logs.local.track`): only the mock flight with the track (log 3) and the mock
// recording have positions, a lap round a point at 150 m, flown at about 8 m/s, with a gap of fifteen seconds in the middle
// where the log has no fix (the replay must hold the last fix there and say so, not draw a line across the gap). The numbers are
// made up for the mock; the rules are the backend's: a log with no position is `UNAVAILABLE` with the reason, never a track at
// 0, 0, and a log that is not verified gives nothing.
import type { LocalLogTrack, TrackPoint } from '@/generated/app'

/** Where the mock flies: a lap of this radius (m) round this place. */
const CENTRE = { lat: 47.5, lon: 8.5 }
const RADIUS_M = 150

/** The gap in the fixes (seconds from the start of the log), the length of the flight, and a fix every 0.5 s. */
const GAP: readonly [number, number] = [40, 55]
const LENGTH_S = 120
const STEP_S = 0.5

/** Metres in a degree of latitude, and in a degree of longitude at the centre. */
const METRES_PER_DEGREE = 111_195
const METRES_PER_DEGREE_EAST = METRES_PER_DEGREE * Math.cos((CENTRE.lat * Math.PI) / 180)

/** The mock flights that have a position: log 3, and the recording. */
const WITH_TRACK = ['00000003', 'imported/']

/** The words of the backend for a log with no position. */
const NO_POSITION = 'the log has no position (no POS with a place, no GPS with a 3D fix): nothing to draw on a map'
const NOT_VERIFIED = 'the log is not verified (its CRC is not the one the vehicle gave): nothing is taken from it'

/**
 * Why the backend would refuse a log's track, as the code and the words, or null when it would give it.
 *
 * @param copy the log that was read
 * @param copy.summary what the read found
 * @param copy.summary.verified whether the copy is the vehicle's
 * @param copy.log the log
 * @param copy.log.key its key
 * @returns the refusal, or null
 */
export function refusalOfTrack(copy: { summary: { verified: boolean }, log: { key: string } }): [string, string] | null {
  if (!copy.summary.verified) {
    return ['NOT_VERIFIED', NOT_VERIFIED]
  }

  return WITH_TRACK.some(part => copy.log.key.includes(part)) ? null : ['UNAVAILABLE', NO_POSITION]
}

/**
 * The place of the mock vehicle at a time: a lap round the centre.
 *
 * @param seconds from the start of the log
 * @returns the place
 */
function placeAt(seconds: number): { lat: number, lon: number } {
  const angle = (seconds / LENGTH_S) * 2 * Math.PI
  const north = RADIUS_M * Math.cos(angle)
  const east = RADIUS_M * Math.sin(angle)

  return { lat: CENTRE.lat + north / METRES_PER_DEGREE, lon: CENTRE.lon + east / METRES_PER_DEGREE_EAST }
}

/**
 * A place at the resolution of the GPS (1e-7 of a degree).
 *
 * @param degrees the number
 * @returns the number rounded
 */
function rounded(degrees: number): number {
  return Math.round(degrees * 1e7) / 1e7
}

/**
 * The fixes of the mock flight, with the gap left out.
 *
 * @param firstUs the time of the first message of the log (microseconds)
 * @returns the points
 */
function pointsOf(firstUs: number): TrackPoint[] {
  const points: TrackPoint[] = []
  for (let s = 0; s <= LENGTH_S; s += STEP_S) {
    const place = placeAt(s)
    if (s < GAP[0] || s > GAP[1]) {
      const timeUs = firstUs + Math.round(s * 1e6)
      points.push({ timeUs, lat: rounded(place.lat), lon: rounded(place.lon), alt: 500 + Math.min(30, s) })
    }
  }

  return points
}

/**
 * The track of a mock log that has positions.
 *
 * @param firstUs the time of the first message of the log (microseconds)
 * @returns the track
 */
export function trackOf(firstUs: number): LocalLogTrack {
  const points = pointsOf(firstUs)
  const [armed, warned, disarmed] = [11, 80, 118].map(s => firstUs + s * 1e6)

  return {
    source: 'pos',
    fixes: points.length + 3,
    skipped: 3,
    points,
    // (the last fix before the gap and the first after it: the points at 39.5 s and 55.5 s)
    gaps: [{ fromUs: firstUs + 39.5e6, toUs: firstUs + 55.5e6 }],
    gapsMore: 0,
    home: { lat: CENTRE.lat + RADIUS_M / METRES_PER_DEGREE, lon: CENTRE.lon },
    events: [
      { timeUs: armed ?? 0, kind: 'armed' },
      { timeUs: warned ?? 0, kind: 'text', text: 'Failsafe: radio' },
      { timeUs: disarmed ?? 0, kind: 'disarmed' },
    ],
  }
}
