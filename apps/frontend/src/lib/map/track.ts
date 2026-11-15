// What the map draws of the vehicle, apart from the tiles: where it is (a marker with its heading, marked as old when the
// vehicle has not been heard for a while, and not there at all without a position), where it has been (a trail of at most 5000
// points, thinned), and where home is. Pure functions and one small class: no DOM, no timers.

/** A place on the earth (degrees). */
export interface LatLon {
  /** The latitude. */
  lat: number
  /** The longitude. */
  lon: number
}

/** How many points the trail keeps. */
export const TRAIL_CAP = 5000

/** The least distance (metres) between two points of the trail: a vehicle that stands still adds none. */
export const TRAIL_STEP_M = 1

/**
 * A place this far (metres) from the last point of the trail is not the next step of the same flight: a vehicle does not fly a
 * kilometre between two positions a fraction of a second apart. It is the vehicle coming back somewhere else (a reconnect
 * after a long time, or another vehicle with the same system id): the path starts again from there, not a line across the map.
 */
export const TRAIL_JUMP_M = 1000

/** After this long (ms) without a position the vehicle is drawn as old (hatched, amber, with "last heard"). */
export const STALE_MS = 3000

/** Metres in a degree of latitude (a sphere of the earth's mean radius: good to a fraction of a percent, enough for a step). */
const METRES_PER_DEGREE = 111_195

/**
 * How far apart two places are, for steps of a few metres (the flat-earth approximation).
 *
 * @param a one place
 * @param b the other
 * @returns metres
 */
export function metresBetween(a: LatLon, b: LatLon): number {
  const north = (b.lat - a.lat) * METRES_PER_DEGREE
  const east = (b.lon - a.lon) * METRES_PER_DEGREE * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))

  return Math.hypot(north, east)
}

/**
 * Whether a place is a place on the earth (numbers within the latitudes and longitudes there are).
 *
 * @param place the place
 * @returns true when it is
 */
function onEarth(place: LatLon): boolean {
  return Math.abs(place.lat) <= 90 && Math.abs(place.lon) <= 180
}

/**
 * Whether a place is (0, 0): how a vehicle without a position says so.
 *
 * @param place the place
 * @returns true when it is
 */
function atOrigin(place: LatLon): boolean {
  return place.lat === 0 && place.lon === 0
}

/**
 * Whether a place is one the map may draw: numbers, on the earth, and not (0, 0), which is how a vehicle without a position
 * says so (a place in the Gulf of Guinea is not where a vehicle is).
 *
 * @param place the place
 * @returns true when it is
 */
export function drawable(place: LatLon | null | undefined): place is LatLon {
  return place ? onEarth(place) && !atOrigin(place) : false
}

/** The vehicle on the map. */
export interface VehicleMark extends LatLon {
  /** Where the nose points (degrees clockwise from north), when the vehicle says. */
  heading?: number
  /** Metres above home, when the vehicle says. */
  height?: number
  /** How long ago the position came (ms). */
  ageMs: number
  /** Whether the position is old. */
  stale: boolean
}

/** What the position group says (the part the map needs). */
export interface PositionLike extends LatLon {
  /** Where the nose points (degrees clockwise from north), when the vehicle says. */
  heading?: number
  /** Metres above home, when the vehicle says. */
  relativeAltitude?: number
  /** How long ago the position came (ms). */
  ageMs: number
}

/**
 * The marker of the vehicle from its position: none without a position (or at 0, 0), old when the position is.
 *
 * @param position the position group, if there is one
 * @returns the marker, or null
 */
export function markOf(position: PositionLike | null | undefined): VehicleMark | null {
  if (!drawable(position)) {
    return null
  }

  return {
    lat: position.lat,
    lon: position.lon,
    heading: position.heading,
    height: position.relativeAltitude,
    ageMs: position.ageMs,
    stale: position.ageMs > STALE_MS,
  }
}

/** The path the vehicle has flown. */
export class Trail {
  private points: LatLon[] = []

  /**
   * The points, oldest first.
   *
   * @returns them (the trail's own array: it is replaced, never changed, when a point comes)
   */
  get all(): readonly LatLon[] {
    return this.points
  }

  /**
   * Adds the place the vehicle is at, unless it has not moved (less than a step from the last point); when it is a kilometre or
   * more from the last point (TRAIL_JUMP_M) the path starts again from it. When the trail is longer than its cap every second
   * point goes, except the first and the last: the whole path stays, at half the detail.
   *
   * @param place the place
   * @returns true when the trail changed
   */
  add(place: LatLon): boolean {
    if (!drawable(place) || !this.moved(place)) {
      return false
    }
    this.points = [...this.jumped(place) ? [] : this.points, { lat: place.lat, lon: place.lon }]
    this.thinWhenLong()

    return true
  }

  /** Thins the trail when it is longer than its cap. */
  private thinWhenLong(): void {
    if (this.points.length > TRAIL_CAP) {
      this.thin()
    }
  }

  /**
   * Whether a place is a kilometre or more from the last point: the vehicle is somewhere else, not a step further.
   *
   * @param place the place
   * @returns true when it is
   */
  private jumped(place: LatLon): boolean {
    const last = this.points.at(-1)

    return last !== undefined && metresBetween(last, place) >= TRAIL_JUMP_M
  }

  /**
   * Whether a place is a step or more from the last point (the first place always is).
   *
   * @param place the place
   * @returns true when it is
   */
  private moved(place: LatLon): boolean {
    const last = this.points.at(-1)

    return last === undefined || metresBetween(last, place) >= TRAIL_STEP_M
  }

  /** Forgets the path (a new vehicle, or the vehicle was armed). */
  reset(): void {
    this.points = []
  }

  /** Drops every second point but the first and the last. */
  private thin(): void {
    const lastIndex = this.points.length - 1
    this.points = this.points.filter((_point, i) => i === lastIndex || i % 2 === 0)
  }
}
