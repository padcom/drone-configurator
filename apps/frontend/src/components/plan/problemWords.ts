// The words of a problem the plan has (lib/plan/validate.ts), as the page says them: the message of its key, filled in with the
// field it is about and the limits that field has.
import { type Field, definitionOf } from '@/lib/plan/catalog'
import type { PlanItem } from '@/lib/plan/model'
import type { Problem } from '@/lib/plan/validate'

/** What says a message. */
type Say = (key: string, params?: Record<string, unknown>) => string

/**
 * The field of an item a problem is about, if it names one.
 *
 * @param problem the problem
 * @param item the item it is about
 * @returns the field
 */
function fieldOf(problem: Problem, item: PlanItem | undefined): Field | undefined {
  const def = item ? definitionOf(item.command) : undefined

  return def?.fields.find(field => field.id === problem.params?.field)
}

/**
 * The words of a problem of an item.
 *
 * @param problem the problem
 * @param item the item it is about
 * @param say says a message
 * @returns its message
 */
export function problemWords(problem: Problem, item: PlanItem | undefined, say: Say): string {
  const field = fieldOf(problem, item)
  // (the yaw has no field of its own: only a command that takes none can lack it)
  const name = say(field ? field.labelKey : 'plan.field.yaw')

  const limits = field ? { min: field.min, max: field.max } : {}

  return say(`plan.problem.${problem.key}`, { ...problem.params, ...limits, name })
}

/**
 * The words of a problem with the item's number in front, when it is about an item.
 *
 * @param problem the problem
 * @param item the item it is about
 * @param say says a message
 * @returns the line
 */
export function problemLine(problem: Problem, item: PlanItem | undefined, say: Say): string {
  const words = problemWords(problem, item, say)

  return problem.itemId === null ? words : say('plan.problem.item', { number: problem.params?.number, words })
}
