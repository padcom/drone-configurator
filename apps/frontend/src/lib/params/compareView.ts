// What the comparison (#40) says, from plain values (no DOM): the text of a row's cells, the summary above the table and the
// line above its button. Vue's templates escape the text; the words come from the translations.
import type { Translate } from '@/lib/fly/telemetryCards'
import type { ParamMeta } from './metadata'
import type { Change } from './paramDiff'
import { type CompareCounts, type CompareRow, valueText } from './paramCompare'
import { renamedOther } from './renameWords'

/** The cells of a row, as text. */
export interface CompareCells {
  /** The value on the vehicle (its name or units from the metadata), or the mark of no value. */
  vehicle: string
  /** The value on the other side, the same way. */
  other: string
  /** How the two compare, or why the row can't be copied, or what is unusual about the value. */
  status: string
  /** `warn` when the status is a reason or a warning (it is said in words too), else ''. */
  tone: 'warn' | ''
}

/**
 * The status of a value that differs and can be copied: what the metadata finds unusual about it, or that it differs.
 *
 * @param warning what the metadata finds unusual, or null
 * @param translate looks up a message
 * @returns the status and its tone
 */
function warningStatus(warning: string | null, translate: Translate): Pick<CompareCells, 'status' | 'tone'> {
  return warning === null
    ? { status: translate('compare.status.differs'), tone: '' }
    : { status: translate('import.unusual', { warning }), tone: 'warn' }
}

/**
 * The status of a row that differs: why it can't be copied, or else its warning.
 *
 * @param change what copying it would change
 * @param translate looks up a message
 * @returns the status and its tone
 */
function changeStatus(change: Change, translate: Translate): Pick<CompareCells, 'status' | 'tone'> {
  return change.problem === null ? warningStatus(change.warning, translate) : { status: change.problem, tone: 'warn' }
}

/**
 * How a row compares, in words.
 *
 * @param row the row
 * @param translate looks up a message
 * @returns the status and its tone
 */
function statusOf(row: CompareRow, translate: Translate): Pick<CompareCells, 'status' | 'tone'> {
  if (row.status === 'vehicleOnly') {
    return { status: translate('compare.status.vehicleOnly'), tone: '' }
  }

  return row.change ? changeStatus(row.change, translate) : { status: translate('compare.status.same'), tone: '' }
}

/**
 * A value, or the mark of none.
 *
 * @param value the value, or null
 * @param meta the parameter's metadata
 * @param translate looks up a message
 * @returns the text
 */
function shown(value: number | null, meta: ParamMeta | undefined, translate: Translate): string {
  return value === null ? translate('import.noValue') : valueText(value, meta)
}

/**
 * The cells of a row.
 *
 * @param row the row
 * @param meta the parameter's metadata, if loaded
 * @param translate looks up a message
 * @returns the text of each cell
 */
export function cellsOf(row: CompareRow, meta: ParamMeta | undefined, translate: Translate): CompareCells {
  const other = shown(row.other, meta, translate)

  return {
    vehicle: shown(row.param?.value ?? null, meta, translate),
    // A value the other side names as an older firmware did says its old name and value too (#202).
    other: row.renamed ? renamedOther(other, row.renamed, translate) : other,
    ...statusOf(row, translate),
  }
}

/**
 * The summary above the table: how many rows of each kind.
 *
 * @param counts the counts
 * @param translate looks up a message
 * @returns the summary
 */
export function summaryOf(counts: CompareCounts, translate: Translate): string {
  return translate('compare.summary', {
    differ: counts.differs,
    vehicleOnly: counts.vehicleOnly,
    otherOnly: counts.otherOnly,
    same: counts.same,
  })
}

/**
 * The line above the button: how many rows are copied across, or how to copy one.
 *
 * @param count how many rows are copied across
 * @param translate looks up a message
 * @returns the line
 */
export function pickedText(count: number, translate: Translate): string {
  return count > 0 ? translate('compare.picked', { count }) : translate('compare.pickSome')
}
