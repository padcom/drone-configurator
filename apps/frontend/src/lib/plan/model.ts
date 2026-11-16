// The plan being edited on the Plan page: plain data, no Vue. It is the page's own (offline: nothing here is on a vehicle until a
// write that was read back says so). An item is one of the commands the backend knows how to verify (planverify.pi).

/** MAV_FRAME of an altitude above the ground at home (the usual one). */
export const FRAME_ABOVE_HOME = 3

/** MAV_FRAME of an altitude above sea level. */
export const FRAME_ABSOLUTE = 0

/** MAV_FRAME of an altitude above the terrain. */
export const FRAME_TERRAIN = 10

/** MAV_FRAME of a command that has no place: its own numbers. */
export const FRAME_OWN = 2

/** The most items a plan has (what the backend takes in one write). */
export const MAX_ITEMS = 2000

/**
 * One item of the mission, as the page edits it. A number that is `null` is not given (the yaw of a waypoint; a place not
 * set yet).
 */
export interface PlanItem {
  /** Names it for as long as the page runs (selection, undo): not on the vehicle, not in a file. */
  id: number
  /** MAV_CMD. */
  command: number
  /** MAV_FRAME of its altitude. */
  frame: number
  /** Degrees, or null while the place is not set. */
  lat: number | null
  /** Degrees, or null while the place is not set. */
  lon: number | null
  /** Metres in `frame`, or null when not set. */
  alt: number | null
  /** The command's first parameter (a null is a NaN on the wire). */
  p1: number | null
  /** The command's second parameter. */
  p2: number | null
  /** The command's third parameter. */
  p3: number | null
  /** The command's fourth parameter (the yaw of a waypoint, which may be left out). */
  p4: number | null
  /** What the vehicle does after it: goes on by itself (the usual). */
  autocontinue: boolean
}

/** The plan. */
export interface Plan {
  /** Its name (a label for the person: not sent to the vehicle). */
  name: string
  /** The items in order: the first is item 1 (the vehicle's own home is item 0 on the wire). */
  items: PlanItem[]
  /** What a new waypoint gets: the altitude (m) and its frame. */
  defaults: { alt: number, frame: number }
}

/** The document the edits work on: the plan and what is selected. */
export interface PlanDocument {
  /** The plan. */
  plan: Plan
  /** The id of the selected item, or null. */
  selected: number | null
}

/**
 * A fresh plan with nothing in it.
 *
 * @returns the plan
 */
export function emptyPlan(): Plan {
  return { name: '', items: [], defaults: { alt: 20, frame: FRAME_ABOVE_HOME } }
}

/**
 * The position of an item in the list (0-based), or -1.
 *
 * @param plan the plan
 * @param id the item's id
 * @returns where it is
 */
export function indexOfItem(plan: Plan, id: number): number {
  return plan.items.findIndex(item => item.id === id)
}
