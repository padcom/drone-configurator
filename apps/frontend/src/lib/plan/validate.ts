// What is wrong with a plan, as a list the page shows (the design's validity header) and the write will refuse on: a problem is
// an error (the vehicle would be given something that is no good) or a warning (a plan that works but is worth a look). Each
// names the item it is about and the message that says it: `plan.problem.<key>`.
import { type CommandDef, type Field, definitionOf, placeNeeded } from './catalog'
import { isFlyTo } from './geometry'
import { FRAME_ABOVE_HOME, MAX_ALTITUDE, MAX_ITEMS, type Plan, type PlanItem } from './model'

/** One thing wrong. */
export interface Problem {
  /** An error would stop a write; a warning is worth a look. */
  level: 'error' | 'warning'
  /** The item it is about (its id), or null for the plan as a whole. */
  itemId: number | null
  /** The message `plan.problem.<key>` says it. */
  key: string
  /** What the message fills in. */
  params?: Record<string, unknown>
}

/** The commands whose fourth parameter (the yaw) may be left out: ArduPilot takes a NaN there (planverify.pi). */
const YAW_MAY_BE_LEFT = new Set([16, 17, 21, 22])

/** MAV_CMD_NAV_TAKEOFF and MAV_CMD_DO_JUMP. */
const TAKEOFF = 22
const DO_JUMP = 177

/**
 * Whether a value is a number (not missing, not NaN, not infinite).
 *
 * @param value what a field holds
 * @returns whether it is a number
 */
function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

/**
 * Whether a number is below or above what a field takes.
 *
 * @param value the number
 * @param min the least
 * @param max the most
 * @returns the key of the problem, or null
 */
function rangeProblem(value: number, min: number, max: number): string | null {
  if (value < min) {
    return 'low'
  }

  return value > max ? 'high' : null
}

/**
 * What is wrong with a number a field holds.
 *
 * @param field the field
 * @param value what it holds
 * @returns the key of the problem, or null
 */
function numberProblem(field: Field, value: number | null): string | null {
  if (!isNumber(value)) {
    return 'number'
  }

  return rangeProblem(value, field.min ?? -Infinity, field.max ?? Infinity)
}

/**
 * Whether a latitude or a longitude is given and cannot be one.
 *
 * @param value the degrees
 * @param most the most it can be
 * @returns whether it is wrong
 */
function offTheGlobe(value: number | null, most: number): boolean {
  return value !== null && (!Number.isFinite(value) || Math.abs(value) > most)
}

/** A problem of an item's place or altitude: the message and whether it stops a write. */
interface Found {
  /** The message `plan.problem.<key>`. */
  key: string
  /** An error stops a write; a warning is worth a look. */
  level: 'error' | 'warning'
}

/**
 * An error.
 *
 * @param key the message
 * @returns the problem
 */
function error(key: string): Found {
  return { key, level: 'error' }
}

/**
 * A warning.
 *
 * @param key the message
 * @returns the problem
 */
function warning(key: string): Found {
  return { key, level: 'warning' }
}

/**
 * The problem of a command that needs a place and has none (set home "given here" and a ROI at "a place" need one too: with
 * none, the vehicle takes "where it is").
 *
 * @param item the item
 * @param def its command
 * @returns the problem, or null
 */
function noPlace(item: PlanItem, def: CommandDef): Found | null {
  return placeNeeded(item, def) && (item.lat === null || item.lon === null) ? error('noPlace') : null
}

/**
 * The problem of a place that is not on the globe.
 *
 * @param item the item
 * @returns the problem, or null
 */
function offGlobe(item: PlanItem): Found | null {
  return offTheGlobe(item.lat, 90) || offTheGlobe(item.lon, 180) ? error('offGlobe') : null
}

/**
 * Whether an item is at 0, 0.
 *
 * @param item the item
 * @returns whether it is
 */
function isZero(item: PlanItem): boolean {
  return item.lat === 0 && item.lon === 0
}

/**
 * Whether an item must be at a real place: it flies to one, or it names one (set home "given here", a ROI "at a place").
 *
 * @param item the item
 * @param def its command
 * @returns whether it must
 */
function needsRealPlace(item: PlanItem, def: CommandDef): boolean {
  return isFlyTo(item) || placeNeeded(item, def)
}

/**
 * The problem of a waypoint or a loiter at 0, 0: ArduPilot takes it for "where the item before it is", and it would be drawn
 * on the equator. A set home "given here" or a ROI "at a place" at 0, 0 is the same: the vehicle takes 0, 0 for where it is.
 *
 * @param item the item
 * @param def its command
 * @returns the problem, or null
 */
function atZero(item: PlanItem, def: CommandDef): Found | null {
  return isZero(item) && needsRealPlace(item, def) ? error('atZero') : null
}

/**
 * Whether a command needs an altitude of its own: it flies at one, and has a place of its own or is a takeoff.
 *
 * @param item the item
 * @param def its command
 * @returns whether it does
 */
function needsAltitude(item: PlanItem, def: CommandDef): boolean {
  return def.altitude && (def.place !== 'optional' || item.command === TAKEOFF)
}

/**
 * The problem of a command that flies at an altitude and has none (one that takes "here" for a place needs none, but a takeoff
 * always needs one).
 *
 * @param item the item
 * @param def its command
 * @returns the problem, or null
 */
function noAltitude(item: PlanItem, def: CommandDef): Found | null {
  return needsAltitude(item, def) && !isNumber(item.alt) ? error('noAltitude') : null
}

/**
 * The problem of a takeoff that does not go up.
 *
 * @param item the item
 * @param alt its altitude
 * @returns the problem, or null
 */
function takeoffRange(item: PlanItem, alt: number): Found | null {
  return item.command === TAKEOFF && alt <= 0 ? error('takeoffAltitude') : null
}

/**
 * The problem of an altitude beyond what the vehicle takes, or of a takeoff that does not go up.
 *
 * @param item the item
 * @returns the problem, or null
 */
function altitudeRange(item: PlanItem): Found | null {
  if (!isNumber(item.alt)) {
    return null
  }

  return item.alt > MAX_ALTITUDE ? error('altHigh') : takeoffRange(item, item.alt)
}

/**
 * The warning of a waypoint or a loiter above home at altitude 0.
 *
 * @param item the item
 * @returns the problem, or null
 */
function zeroAltitude(item: PlanItem): Found | null {
  return isFlyTo(item) && item.alt === 0 ? warning('zeroAltitude') : null
}

/**
 * The warning of an altitude that is almost certainly a mistake: below home, or 0 where ArduPilot takes it for "the altitude of
 * the item before it" (a waypoint or a loiter above home).
 *
 * @param item the item
 * @returns the problem, or null
 */
function suspectAltitude(item: PlanItem): Found | null {
  if (!isNumber(item.alt) || item.frame !== FRAME_ABOVE_HOME) {
    return null
  }

  return item.alt < 0 ? warning('altNegative') : zeroAltitude(item)
}

/**
 * What is wrong with an item's place and altitude.
 *
 * @param item the item
 * @returns the problems
 */
function placeProblems(item: PlanItem): Found[] {
  const def = definitionOf(item.command)
  const found = def === undefined
    ? []
    : [noPlace(item, def), offGlobe(item), atZero(item, def), noAltitude(item, def), altitudeRange(item), suspectAltitude(item)]

  return found.filter((problem): problem is Found => problem !== null)
}

/**
 * The problem of a missing yaw, for a command that does not take it left out.
 *
 * @param item the item
 * @returns none or one problem
 */
function yawProblem(item: PlanItem): { key: string, field: string }[] {
  return !YAW_MAY_BE_LEFT.has(item.command) && item.p4 === null ? [{ key: 'number', field: 'p4' }] : []
}

/**
 * What is wrong with an item's parameters: the fields of its form, and the yaw that has no field and must be a number for the
 * commands that do not take it left out.
 *
 * @param item the item
 * @returns the keys of the problems, each with the field's id
 */
function fieldProblems(item: PlanItem): { key: string, field: string }[] {
  const fields = definitionOf(item.command)?.fields ?? []
  const found = fields.flatMap(field => {
    const key = numberProblem(field, field.read(item))

    return key === null ? [] : [{ key, field: field.id }]
  })

  return [...found, ...yawProblem(item)]
}

/**
 * Whether the target of a jump is an item of the plan, by its number.
 *
 * @param to the target
 * @param count how many items the plan has
 * @returns whether it is
 */
function isTarget(to: number | null, count: number): boolean {
  return to !== null && Number.isInteger(to) && to >= 1 && to <= count
}

/**
 * Everything that is wrong with one item.
 *
 * @param item the item
 * @param number its number in the plan (from 1)
 * @param count how many items the plan has
 * @returns the problems
 */
function itemProblems(item: PlanItem, number: number, count: number): Problem[] {
  const of = (key: string, extra: Record<string, unknown> = {}, level: Problem['level'] = 'error'): Problem => ({
    level, itemId: item.id, key, params: { number, ...extra },
  })
  const found = [
    ...placeProblems(item).map(problem => of(problem.key, { max: MAX_ALTITUDE }, problem.level)),
    ...fieldProblems(item).map(problem => of(problem.key, { field: problem.field })),
  ]

  return item.command === DO_JUMP && !isTarget(item.p1, count) ? [...found, of('jumpTarget')] : found
}

/**
 * Whether the first thing the vehicle flies to is not a takeoff (then it must already be flying when the mission starts).
 *
 * @param plan the plan
 * @returns whether the first navigation item is not a takeoff
 */
function startsWithoutTakeoff(plan: Plan): boolean {
  const first = plan.items.find(item => definitionOf(item.command)?.nav === true)

  return first !== undefined && first.command !== TAKEOFF
}

/**
 * The problem of a plan that has more items than the page takes, or than the vehicle takes once it has said how many.
 *
 * @param count how many items the plan has
 * @param vehicleLimit how many the vehicle takes, or null while that is not known
 * @returns the problem, or null
 */
function sizeProblem(count: number, vehicleLimit: number | null): Problem | null {
  const limit = vehicleLimit === null ? MAX_ITEMS : Math.min(MAX_ITEMS, vehicleLimit)
  if (count <= limit) {
    return null
  }

  return { level: 'error', itemId: null, key: limit < MAX_ITEMS ? 'overVehicle' : 'tooMany', params: { max: limit } }
}

/**
 * What is wrong with the plan as a whole: more items than the page takes or than the vehicle says it takes, and a start that
 * is not a takeoff.
 *
 * @param plan the plan
 * @param vehicleLimit how many items the vehicle takes, once it has said (null while it is not known)
 * @returns the problems
 */
function wholeProblems(plan: Plan, vehicleLimit: number | null): Problem[] {
  const whole: Problem[] = []
  const size = sizeProblem(plan.items.length, vehicleLimit)
  if (size) {
    whole.push(size)
  }
  if (startsWithoutTakeoff(plan)) {
    whole.push({ level: 'warning', itemId: null, key: 'noTakeoff' })
  }

  return whole
}

/**
 * Everything that is wrong with a plan: what is about the plan as a whole, then the items' in their order.
 *
 * @param plan the plan
 * @param vehicleLimit how many items the vehicle takes, once it has said (null while it is not known)
 * @returns the problems
 */
export function problemsOf(plan: Plan, vehicleLimit: number | null = null): Problem[] {
  const items = plan.items.flatMap((item, index) => itemProblems(item, index + 1, plan.items.length))

  return [...wholeProblems(plan, vehicleLimit), ...items]
}
