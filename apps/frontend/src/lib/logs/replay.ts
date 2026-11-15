// The replay of a log on the map, without a window: the track the backend gave (thinned positions, home, events) turned into
// what the map draws at a moment of the log, and the clock that moves that moment. Nothing is made up: before the first fix and
// in a gap of fixes the vehicle is not drawn where it was not (a gap holds the last fix and says how old it is), a fix at 0, 0
// is never a place, and a log with no position has no track.
import type { LocalLogTrack, ModeChange, TrackPoint } from '@/generated/app'
import type { ChartPoint } from '@/lib/charts/chart'
import { asNumber } from '@/lib/logs/localLogs'
import { type LatLon, STALE_MS, type VehicleMark, metresBetween } from '@/lib/map/track'

/** A fix with its time in seconds from the start of the log. */
export interface ReplayFix extends LatLon {
  /** Seconds from the first message of the log. */
  t: number
  /** Metres above sea level, when the log says it. */
  alt?: number
}

/** What happened, for the "Jump to" list. */
export interface Jump {
  /** Seconds from the start of the log. */
  t: number
  /** What it is: the vehicle armed, disarmed, changed its flight mode, or printed a warning. */
  kind: 'armed' | 'disarmed' | 'mode' | 'text'
  /** The vehicle's own words (for `text`). */
  text?: string
  /** The mode number it changed to (for `mode`). */
  mode?: number
}

/** The track of a log as the page keeps it. */
export interface ReplayTrack {
  /** Where the positions come from: the EKF (`pos`) or the GPS (`gps`). */
  source: 'pos' | 'gps'
  /** The fixes, in time order. */
  fixes: ReplayFix[]
  /** The same places, for drawing (a path is a list of places). */
  places: LatLon[]
  /** Where the log says home was, or null. */
  home: LatLon | null
  /** How many positions the log has. */
  total: number
  /** How many positions were no place. */
  skipped: number
  /** The time of the first fix (seconds). */
  from: number
  /** The time of the last fix (seconds). */
  to: number
}

/** A gap in the fixes longer than this (seconds) holds the last fix, and the vehicle is drawn as not heard since. */
export const GAP_S = 3

/**
 * A fix of the track as the page keeps it.
 *
 * @param point what the backend gave
 * @param firstUs the time of the first message of the log (microseconds)
 * @returns the fix
 */
function fixOf(point: TrackPoint, firstUs: number): ReplayFix {
  const fix: ReplayFix = { t: (asNumber(point.timeUs) - firstUs) / 1e6, lat: point.lat, lon: point.lon }
  if (point.alt !== undefined) {
    fix.alt = point.alt
  }

  return fix
}

/**
 * The first and last times of the fixes.
 *
 * @param fixes the fixes
 * @returns seconds (0 and 0 for none)
 */
function endsOf(fixes: readonly ReplayFix[]): { from: number, to: number } {
  const times = fixes.map(fix => fix.t)

  return { from: times[0] ?? 0, to: times.at(-1) ?? 0 }
}

/**
 * The track as the page keeps it, from what the backend answered.
 *
 * @param answer the backend's answer
 * @param firstUs the time of the first message of the log (microseconds)
 * @returns the track
 */
export function trackOf(answer: LocalLogTrack, firstUs: number): ReplayTrack {
  const fixes = answer.points.map(point => fixOf(point, firstUs))

  return {
    source: answer.source,
    fixes,
    places: fixes.map(({ lat, lon }) => ({ lat, lon })),
    home: answer.home ? { ...answer.home } : null,
    total: answer.fixes,
    skipped: answer.skipped,
    ...endsOf(fixes),
  }
}

/**
 * The index of the last fix at or before a time (a few thousand fixes at most: a search from the end costs nothing a frame).
 *
 * @param fixes the fixes, in time order
 * @param t seconds from the start of the log
 * @returns the index, or -1 when the time is before the first fix
 */
export function indexAt(fixes: readonly ReplayFix[], t: number): number {
  return fixes.findLastIndex(fix => fix.t <= t)
}

/**
 * The way from one place to another, in degrees clockwise from north.
 *
 * @param a where it starts
 * @param b where it ends
 * @returns the bearing (0 to 360)
 */
export function bearing(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180
  const turn = (b.lon - a.lon) * rad
  const east = Math.sin(turn) * Math.cos(b.lat * rad)
  const north = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(turn)

  return (Math.atan2(east, north) / rad + 360) % 360
}

/** The least distance (m) for a heading to be drawn: a vehicle that has not moved does not point anywhere. */
const HEADING_STEP_M = 1

/**
 * The vehicle held at a fix: it is where it was last heard, and old by the time since.
 *
 * @param here the fix
 * @param t seconds from the start of the log
 * @returns the marker
 */
function held(here: ReplayFix, t: number): VehicleMark {
  const ageMs = (t - here.t) * 1000

  return { lat: here.lat, lon: here.lon, ageMs, stale: ageMs > STALE_MS }
}

/**
 * The vehicle between two fixes: where a straight line puts it, heading the way the line goes (none when it has not moved).
 *
 * @param here the fix before
 * @param next the fix after
 * @param t seconds from the start of the log
 * @returns the marker
 */
function between(here: ReplayFix, next: ReplayFix, t: number): VehicleMark {
  const share = next.t === here.t ? 0 : (t - here.t) / (next.t - here.t)
  const mark: VehicleMark = {
    lat: here.lat + (next.lat - here.lat) * share,
    lon: here.lon + (next.lon - here.lon) * share,
    ageMs: 0,
    stale: false,
  }
  if (metresBetween(here, next) >= HEADING_STEP_M) {
    mark.heading = bearing(here, next)
  }

  return mark
}

/**
 * The fixes either side of a time, when they are close enough to say where the vehicle was between them (no gap, not an end).
 *
 * @param track the track
 * @param t seconds from the start of the log
 * @returns both, or null
 */
function neighbours(track: ReplayTrack, t: number): [ReplayFix, ReplayFix] | null {
  const i = indexAt(track.fixes, t)
  const [here, next] = [track.fixes[i], track.fixes[i + 1]]

  return here !== undefined && next !== undefined && next.t - here.t <= GAP_S ? [here, next] : null
}

/**
 * The vehicle at a time of the log. Before the first fix there is none. Between two fixes it is where a straight line puts it,
 * heading the way the line goes; in a gap of more than GAP_S seconds, and after the last fix, it stays at the last fix and is
 * marked as old, with how old (the same as a live vehicle that is not heard).
 *
 * @param track the track
 * @param t seconds from the start of the log
 * @returns the marker, or null
 */
export function markAt(track: ReplayTrack, t: number): VehicleMark | null {
  const here = track.fixes[indexAt(track.fixes, t)]
  if (here === undefined) {
    return null
  }
  const pair = neighbours(track, t)

  return pair ? between(pair[0], pair[1], t) : held(here, t)
}

/** The path flown up to a time and the path ahead of it. */
export interface Paths {
  /** From the first fix to the vehicle. */
  flown: LatLon[]
  /** From the vehicle to the last fix. */
  ahead: LatLon[]
}

/**
 * The path split at a time: the fixes up to it, then the vehicle's place, and from the vehicle's place the fixes after it. Before
 * the first fix nothing has been flown and the whole path is ahead.
 *
 * @param track the track
 * @param t seconds from the start of the log
 * @param mark the vehicle at that time (it ends the first and begins the second)
 * @returns both paths
 */
export function splitPath(track: ReplayTrack, t: number, mark: LatLon | null): Paths {
  const i = indexAt(track.fixes, t)
  const before = track.places.slice(0, i + 1)
  const after = track.places.slice(i + 1)
  if (mark === null) {
    return { flown: before, ahead: after }
  }
  // The vehicle ends the path flown and begins the path ahead, unless it is at the fix that does already (no line of no length).
  const at = (place: LatLon | undefined) => place?.lat === mark.lat && place.lon === mark.lon

  return { flown: at(before.at(-1)) ? before : [...before, mark], ahead: at(after[0]) ? after : [mark, ...after] }
}

/**
 * The speed over the ground at a time, from the fixes either side of it (m/s); nothing in a gap of fixes or at the ends.
 *
 * @param track the track
 * @param t seconds from the start of the log
 * @returns the speed, or undefined when the log cannot say
 */
export function groundSpeedAt(track: ReplayTrack, t: number): number | undefined {
  const pair = neighbours(track, t)

  return pair && pair[1].t > pair[0].t ? metresBetween(pair[0], pair[1]) / (pair[1].t - pair[0].t) : undefined
}

/**
 * The height above sea level at a time (the last fix that says one), when the log says it.
 *
 * @param track the track
 * @param t seconds from the start of the log
 * @returns metres, or undefined
 */
export function altitudeAt(track: ReplayTrack, t: number): number | undefined {
  return track.fixes[indexAt(track.fixes, t)]?.alt
}

/**
 * What happened, in time order: the vehicle's events from the track and the changes of flight mode. Times before the log's first
 * message are held to its start.
 *
 * @param answer the backend's answer
 * @param modes the changes of flight mode
 * @param firstUs the time of the first message of the log (microseconds)
 * @returns the list
 */
export function jumpsOf(answer: LocalLogTrack, modes: readonly ModeChange[], firstUs: number): Jump[] {
  const at = (us: number | bigint) => Math.max(0, (asNumber(us) - firstUs) / 1e6)
  const events: Jump[] = answer.events.map(event => ({
    t: at(event.timeUs),
    kind: event.kind,
    ...event.text === undefined ? {} : { text: event.text },
  }))
  const changes: Jump[] = modes.map(change => ({ t: at(change.timeUs), kind: 'mode', mode: change.mode }))

  return [...events, ...changes].sort((a, b) => a.t - b.t)
}

/** How many parts the time of the log is cut in for the series of the tiles. */
export const TILE_PARTS = 400

/**
 * Whether a point of a series holds a value near a time.
 *
 * @param point the point
 * @param t seconds from the start of the log
 * @param reach how far a part of the time reaches (seconds)
 * @returns true when it does
 */
function holds(point: ChartPoint, t: number, reach: number): boolean {
  return point.y !== null && Math.abs(point.x - t) <= reach
}

/**
 * The value of a thinned series at a time: the part of the time nearest to it that holds a value (a gap, or a time far from any
 * part that has one, gives none: the tile says so and shows no number).
 *
 * @param points the points of the series (one for each part of the time that has samples, a gap is a point with no value)
 * @param t seconds from the start of the log
 * @param length how long the log is (seconds)
 * @returns the value, or undefined
 */
export function seriesAt(points: readonly ChartPoint[], t: number, length: number): number | undefined {
  const reach = Math.max(1, (length / TILE_PARTS) * 0.75)
  const near = points.filter(point => holds(point, t, reach)).sort((a, b) => Math.abs(a.x - t) - Math.abs(b.x - t))

  return near[0]?.y ?? undefined
}

/** The speeds of a replay, as the board has them. */
export const SPEEDS = [0.5, 1, 2, 4, 8] as const

/** The clock of a replay: where it is, whether it runs, and how fast. The page tells it how long passed: it knows no frames. */
export class ReplayClock {
  /** Seconds from the start of the log. */
  time = 0
  /** Whether it runs. */
  playing = false
  /** How many seconds of the log pass in one second. */
  speed = 1

  /**
   * Makes a clock of a log of some length.
   *
   * @param length how long the log is (seconds)
   */
  constructor(public length: number) {}

  /**
   * Time passed (what a frame measured): the clock moves on if it runs, and stops at the end.
   *
   * @param ms how long it was since the last frame
   * @returns true when the time changed
   */
  advance(ms: number): boolean {
    if (!this.playing) {
      return false
    }
    this.time = Math.min(this.length, this.time + (Math.max(0, ms) / 1000) * this.speed)
    this.playing = this.time < this.length

    return true
  }

  /**
   * Goes to a time (held inside the log).
   *
   * @param t seconds
   */
  seek(t: number): void {
    this.time = Math.min(this.length, Math.max(0, t))
  }

  /** Runs, or stops; at the end it begins again from the start. */
  toggle(): void {
    if (this.playing) {
      this.playing = false

      return
    }

    if (this.time >= this.length) {
      this.time = 0
    }
    this.playing = this.length > 0
  }
}
