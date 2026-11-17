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
 * Whether an item is a waypoint or a loiter: the commands that fly to the place they have (16 to 19).
 *
 * @param item the item
 * @returns whether it is
 */
export function isFlyTo(item: PlanItem): boolean {
  return item.command >= 16 && item.command <= 19
}

/**
 * Whether a place is 0, 0: Null Island, which the vehicle takes for "no place".
 *
 * @param place the place
 * @returns whether it is
 */
function isNull(place: Position): boolean {
  return place.lat === 0 && place.lon === 0
}

/**
 * The place an item has set, whatever the command.
 *
 * @param item the item
 * @returns its place, or null while it is not set
 */
function positionOf(item: PlanItem): Position | null {
  return item.lat === null || item.lon === null ? null : { lat: item.lat, lon: item.lon }
}

/**
 * The place of an item, when it has one that is set and counts: a navigation command with a latitude and a longitude that are
 * not both 0 (the vehicle takes 0, 0 for "where it is", never for a place).
 *
 * @param item the item
 * @returns its place, or null
 */
export function placeOf(item: PlanItem): Position | null {
  const place = positionOf(item)

  return place && isNav(item) && !isNull(place) ? place : null
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
  /**
   * The length of the route as drawn: through the places that are set, in the order of the items (no leg from home, no jumps or
   * repeats, items without a place left out), in metres (null with fewer than two). A drawing aid, not a flight length.
   */
  distance: number | null
  /** The highest altitude of an item with one, in metres, when all of them are measured from the same thing (else null). */
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
 * The items that count for the highest altitude: navigation items with an altitude that is not 0.
 *
 * @param plan the plan
 * @returns them
 */
function withAltitude(plan: Plan): PlanItem[] {
  return plan.items.filter(item => item.alt !== null && item.alt !== 0 && isNav(item))
}

/**
 * The highest altitude of the items, when they agree on what it is measured from (30 m above home and 450 m above sea level
 * cannot be compared).
 *
 * @param plan the plan
 * @returns metres, or null with none or with frames that differ
 */
function highestOf(plan: Plan): number | null {
  const items = withAltitude(plan)
  const same = new Set(items.map(item => item.frame)).size === 1

  return same ? Math.max(...items.map(item => item.alt as number)) : null
}

/**
 * The numbers the stats strip shows.
 *
 * @param plan the plan
 * @returns them
 */
export function statsOf(plan: Plan): Stats {
  const places = plan.items.map(placeOf).filter((place): place is Position => place !== null)

  return { items: plan.items.length, distance: lengthOf(places), highest: highestOf(plan) }
}

/** An item that has a place, for the map: which item, its number, and where. */
export interface Pin extends Position {
  /** The id of the item. */
  id: number
  /** The number of the item in the plan, from 1 (an item without a place leaves its number out). */
  number: number
}

/**
 * The items that have a place, in the order of the route, with the numbers they have in the plan.
 *
 * @param plan the plan
 * @returns the pins
 */
export function pinsOf(plan: Plan): Pin[] {
  return plan.items.flatMap((item, index) => {
    const place = placeOf(item)

    return place === null ? [] : [{ id: item.id, number: index + 1, ...place }]
  })
}
