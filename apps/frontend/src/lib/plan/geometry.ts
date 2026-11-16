// Distances and the picture of a route, from the items' places alone (no map, no terrain, no made-up numbers): what the page
// can say of a plan that is not on a vehicle.
import { definitionOf } from './catalog'
import type { Plan, PlanItem } from './model'

/** Metres of a degree of latitude. */
const METRES_PER_DEGREE = 111320

/** A place, in degrees. */
export interface Position {
  /** Degrees north. */
  lat: number
  /** Degrees east. */
  lon: number
}

/**
 * Whether the vehicle flies to an item (a navigation command).
 *
 * @param item the item
 * @returns whether it is
 */
function isNav(item: PlanItem): boolean {
  return definitionOf(item.command)?.nav === true
}

/**
 * The place of an item, when it has one that is set and counts (a navigation command).
 *
 * @param item the item
 * @returns its place, or null
 */
export function placeOf(item: PlanItem): Position | null {
  if (!isNav(item) || item.lat === null || item.lon === null) {
    return null
  }

  return { lat: item.lat, lon: item.lon }
}

/**
 * How far two places are from each other, in metres (flat earth: all a mission of some kilometres needs).
 *
 * @param a one place
 * @param b the other
 * @returns metres
 */
export function distanceBetween(a: Position, b: Position): number {
  const middle = ((a.lat + b.lat) / 2) * Math.PI / 180

  return Math.hypot((b.lat - a.lat) * METRES_PER_DEGREE, (b.lon - a.lon) * METRES_PER_DEGREE * Math.cos(middle))
}

/** What the page says of the plan. */
export interface Stats {
  /** How many items. */
  items: number
  /** The length of the route through the places that are set, in metres (null with fewer than two). */
  distance: number | null
  /** The highest altitude of an item with one, in metres in its own frame (null with none). */
  highest: number | null
}

/**
 * The length of a route through places.
 *
 * @param places the places in order
 * @returns metres, or null with fewer than two
 */
function lengthOf(places: readonly Position[]): number | null {
  let distance: number | null = null
  for (let i = 1; i < places.length; i += 1) {
    distance = (distance ?? 0) + distanceBetween(places[i - 1] as Position, places[i] as Position)
  }

  return distance
}

/**
 * The altitude an item counts for the highest (a navigation item that has one that is not zero), as a list of none or one.
 *
 * @param item the item
 * @returns the altitude in a list, or an empty one
 */
function altitudeOf(item: PlanItem): number[] {
  return item.alt !== null && item.alt !== 0 && isNav(item) ? [item.alt] : []
}

/**
 * The numbers the stats strip shows.
 *
 * @param plan the plan
 * @returns them
 */
export function statsOf(plan: Plan): Stats {
  const places = plan.items.map(placeOf).filter((place): place is Position => place !== null)
  const altitudes = plan.items.flatMap(altitudeOf)

  return {
    items: plan.items.length,
    distance: lengthOf(places),
    highest: altitudes.length === 0 ? null : Math.max(...altitudes),
  }
}

/** A point of the sketch: where in the picture (0 to 1000), for which item. */
export interface SketchPoint {
  /** The id of the item. */
  id: number
  /** The number of the item in the plan, from 1. */
  number: number
  /** Units from the left. */
  x: number
  /** Units from the top. */
  y: number
}

/** The picture of the route. */
export interface Sketch {
  /** The points, in the order of the route. */
  points: SketchPoint[]
  /** How many metres a hundred units of the picture are (for the scale), or null with one point. */
  metresPerHundred: number | null
}

/** The size of the picture's square (units) and the room kept at its edge for the pins. */
const SKETCH = 1000
const MARGIN = 80

/** An item's place as metres from the first one. */
interface Metres {
  id: number
  number: number
  east: number
  north: number
}

/**
 * The places of a plan as metres east and north of the first.
 *
 * @param plan the plan
 * @returns them, in the order of the route
 */
function metresOf(plan: Plan): Metres[] {
  const placed = plan.items.flatMap((item, index) => {
    const place = placeOf(item)

    return place === null ? [] : [{ id: item.id, number: index + 1, place }]
  })
  const first: Position = placed[0]?.place ?? { lat: 0, lon: 0 }
  const cos = Math.cos(first.lat * Math.PI / 180)

  return placed.map(p => ({
    id: p.id,
    number: p.number,
    east: (p.place.lon - first.lon) * METRES_PER_DEGREE * cos,
    north: (p.place.lat - first.lat) * METRES_PER_DEGREE,
  }))
}

/**
 * The route drawn into a square picture, north up, the longer side of the plan filling it. Without a map, so only the shape.
 *
 * @param plan the plan
 * @returns the points
 */
export function sketchOf(plan: Plan): Sketch {
  const metres = metresOf(plan)
  if (metres.length === 0) {
    return { points: [], metresPerHundred: null }
  }
  const west = Math.min(...metres.map(p => p.east))
  const east = Math.max(...metres.map(p => p.east))
  const south = Math.min(...metres.map(p => p.north))
  const north = Math.max(...metres.map(p => p.north))
  const size = Math.max(east - west, north - south)
  const scale = size > 0 ? (SKETCH - 2 * MARGIN) / size : 1
  // (a single place, or all on one spot, is drawn in the middle)
  const left = (SKETCH - (east - west) * scale) / 2
  const top = (SKETCH - (north - south) * scale) / 2

  return {
    points: metres.map(p => ({
      id: p.id,
      number: p.number,
      x: left + (p.east - west) * scale,
      y: top + (north - p.north) * scale,
    })),
    metresPerHundred: size > 0 ? 100 / scale : null,
  }
}
