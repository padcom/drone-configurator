// What the Description block of the parameter detail says, from the metadata alone (no DOM): the full text, and the range,
// unit, step, values, bits and reboot flag as rows. Nothing is invented: a parameter the metadata does not know says so, in one
// line, and without any metadata the line says where it comes from.
import type { ParamMeta } from './metadata'
import type { Translate } from './telemetryCards'

/** One row of the block: a label and one or more lines. */
export interface DescriptionRow {
  /** What the row is. */
  label: string
  /** Its lines (one for a range, one for each value or bit). */
  items: string[]
}

/** The block. */
export interface DescriptionBlock {
  /** The long explanation (the short description is at the top of the detail, not repeated here). */
  text: string | null
  /** The facts. */
  rows: DescriptionRow[]
  /** One line for when there is nothing else to say (empty otherwise). */
  hint: string
}

/**
 * A row, when it has something to say.
 *
 * @param label what the row is
 * @param items its lines
 * @returns the row, or an empty list when there is no line
 */
function row(label: string, items: string[]): DescriptionRow[] {
  return items.length > 0 ? [{ label, items }] : []
}

/**
 * Codes with their names, as lines, in the order of the codes.
 *
 * @param names the names by code
 * @param line makes the line of one code and its name
 * @returns the lines
 */
function namedLines(names: Record<string, string> | undefined, line: (code: string, name: string) => string): string[] {
  return Object.entries(names ?? {}).sort(([a], [b]) => Number(a) - Number(b)).map(([code, name]) => line(code, name))
}

/**
 * The unit as it follows a number.
 *
 * @param meta what is known of the parameter
 * @returns the unit with a space before it, or an empty string
 */
function unitSuffix(meta: ParamMeta): string {
  return meta.units ? ` ${meta.units}` : ''
}

/**
 * The range, as one line.
 *
 * @param meta what is known of the parameter
 * @param translate looks up a message
 * @returns the line, or an empty list without a limit
 */
function rangeLine(meta: ParamMeta, translate: Translate): string[] {
  const { min, max } = meta
  if (min === undefined && max === undefined) {
    return []
  }
  const [low, high] = [min, max].map(limit => limit ?? translate('editor.openEnd'))

  return [translate('description.rangeValue', { min: low, max: high, units: unitSuffix(meta) })]
}

/**
 * The range, the unit and the step, as rows.
 *
 * @param meta what is known of the parameter
 * @param translate looks up a message
 * @returns the rows that apply
 */
function sizeRows(meta: ParamMeta, translate: Translate): DescriptionRow[] {
  const step = meta.increment === undefined ? [] : [`${meta.increment}${unitSuffix(meta)}`]

  return [
    ...row(translate('description.range'), rangeLine(meta, translate)),
    ...row(translate('description.units'), meta.units ? [meta.units] : []),
    ...row(translate('description.increment'), step),
  ]
}

/**
 * The values and the bits, as rows.
 *
 * @param meta what is known of the parameter
 * @param translate looks up a message
 * @returns the rows that apply
 */
function nameRows(meta: ParamMeta, translate: Translate): DescriptionRow[] {
  const bit = (code: string, name: string) => translate('description.bit', { bit: code, name })

  return [
    ...row(translate('description.values'), namedLines(meta.values, (code, name) => `${code}  ${name}`)),
    ...row(translate('description.bits'), namedLines(meta.bits, bit)),
  ]
}

/**
 * The rows and the text of a parameter that the metadata knows: the long description (the short one is at the top of the
 * detail, so a parameter that has only that has nothing missing here).
 *
 * @param meta what is known of the parameter
 * @param translate looks up a message
 * @returns the block, with its hint
 */
function knownBlock(meta: ParamMeta, translate: Translate): DescriptionBlock {
  const restart = meta.rebootRequired ? [translate('description.rebootYes')] : []
  const rows = [...sizeRows(meta, translate), ...nameRows(meta, translate), ...row(translate('description.reboot'), restart)]
  const text = meta.longDescription ?? null
  const shown = [text, meta.description, rows[0]].some(part => part !== null && part !== undefined)

  return { text, rows, hint: shown ? '' : translate('description.hintMissing') }
}

/**
 * The block of a parameter.
 *
 * @param meta what the metadata says about it, if anything
 * @param loaded whether any metadata is loaded at all
 * @param translate looks up a message
 * @returns the text, the rows and the hint
 */
export function descriptionOf(meta: ParamMeta | undefined, loaded: boolean, translate: Translate): DescriptionBlock {
  if (meta) {
    return knownBlock(meta, translate)
  }

  return { text: null, rows: [], hint: translate(loaded ? 'description.hintMissing' : 'description.hintNone') }
}
