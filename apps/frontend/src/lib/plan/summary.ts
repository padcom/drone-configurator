// The one line a list of items says of an item: its main value. Plain data in, a string out (no i18n: numbers and units only).
import { type Field, definitionOf } from './catalog'
import type { PlanItem } from './model'

/**
 * A number with its unit.
 *
 * @param value the number
 * @param unit the unit, if any
 * @returns the text
 */
function withUnit(value: number, unit: string | undefined): string {
  return unit ? `${value} ${unit}` : String(value)
}

/**
 * What a field of an item says, as text.
 *
 * @param field the field
 * @param item the item
 * @returns the text, or an empty one when the field holds no number
 */
function say(field: Field, item: PlanItem): string {
  const value = field.read(item)

  return value === null ? '' : withUnit(value, field.unit)
}

/**
 * The first field of a command that is a number, as text.
 *
 * @param item the item
 * @returns the text of what it holds, or an empty one
 */
function firstNumber(item: PlanItem): string {
  const field = definitionOf(item.command)?.fields.find(candidate => candidate.kind === 'number')

  return field ? say(field, item) : ''
}

/**
 * The main value of an item: its altitude when it has one, else its first number field.
 *
 * @param item the item
 * @returns the text, or an empty one
 */
export function summaryOf(item: PlanItem): string {
  const hasAltitude = definitionOf(item.command)?.altitude === true && item.alt !== null

  return hasAltitude ? `${item.alt} m` : firstNumber(item)
}
