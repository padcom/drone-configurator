// What is wrong with a plan, as a list the page shows (the design's validity header) and the write will refuse on: a problem is
// an error (the vehicle would be given something that is no good) or a warning (a plan that works but is worth a look). Each
// names the item it is about and the message that says it: `plan.problem.<key>`.
import { type CommandDef, type Field, definitionOf } from './catalog'
import { MAX_ITEMS, type Plan, type PlanItem } from './model'

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

/**
 * The problem of a command that needs a place and has none.
 *
 * @param item the item
 * @param def its command
 * @returns the key, or null
 */
function noPlace(item: PlanItem, def: CommandDef): string | null {
  return def.place === 'required' && (item.lat === null || item.lon === null) ? 'noPlace' : null
}

/**
 * The problem of a place that is not on the globe.
 *
 * @param item the item
 * @returns the key, or null
 */
function offGlobe(item: PlanItem): string | null {
  return offTheGlobe(item.lat, 90) || offTheGlobe(item.lon, 180) ? 'offGlobe' : null
}

/**
 * The problem of a command that flies at an altitude and has none (one that takes "here" for a place needs none).
 *
 * @param item the item
 * @param def its command
 * @returns the key, or null
 */
function noAltitude(item: PlanItem, def: CommandDef): string | null {
  return def.altitude && def.place !== 'optional' && !isNumber(item.alt) ? 'noAltitude' : null
}

/**
 * What is wrong with an item's place and altitude.
 *
 * @param item the item
 * @returns the keys of the problems
 */
function placeProblems(item: PlanItem): string[] {
  const def = definitionOf(item.command)
  const found = def === undefined ? [] : [noPlace(item, def), offGlobe(item), noAltitude(item, def)]

  return found.filter((key): key is string => key !== null)
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
  const of = (key: string, extra: Record<string, unknown> = {}): Problem => ({
    level: 'error', itemId: item.id, key, params: { number, ...extra },
  })
  const found = [
    ...placeProblems(item).map(key => of(key)),
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
 * Everything that is wrong with a plan: what is about the plan as a whole, then the items' in their order.
 *
 * @param plan the plan
 * @returns the problems
 */
export function problemsOf(plan: Plan): Problem[] {
  const whole: Problem[] = []
  if (plan.items.length > MAX_ITEMS) {
    whole.push({ level: 'error', itemId: null, key: 'tooMany', params: { max: MAX_ITEMS } })
  }
  if (startsWithoutTakeoff(plan)) {
    whole.push({ level: 'warning', itemId: null, key: 'noTakeoff' })
  }

  return [...whole, ...plan.items.flatMap((item, index) => itemProblems(item, index + 1, plan.items.length))]
}
