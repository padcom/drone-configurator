// What the parameter list shows, from plain values (no DOM). Vue's templates escape the text; the words come from
// the translations.
import type { Param } from './generated/app'
import type { State } from './state'
import type { Translate } from './telemetryCards'

/**
 * The parameters matching the filter (case-insensitive, anywhere in the name).
 *
 * @param params every parameter
 * @param filter what the user typed
 * @returns the matching parameters, in their order
 */
export function visibleParams(params: Param[], filter: string): Param[] {
  const needle = filter.trim().toUpperCase()

  return needle === '' ? params : params.filter(param => param.id.includes(needle))
}

/** The messages for a list that is not there: not asked for yet, on its way, or failed. */
const NO_LIST: Record<'none' | 'loading' | 'failed', string> = {
  none: 'params.status.none',
  loading: 'params.status.loading',
  failed: 'params.status.failed',
}

/** What the list's status line is made from. */
export interface ListCounts {
  /** `loading`, or how the last download ended. */
  list: State['list']
  /** How many parameters there are. */
  total: number
  /** The indexes that never arrived. */
  missing: number[]
  /** How many pass the filter. */
  shown: number
}

/**
 * How the parameter list stands.
 *
 * @param counts the state of the download and the counts
 * @param translate looks up a message
 * @returns the sentence for the list's status line
 */
export function listStatusText(counts: ListCounts, translate: Translate): string {
  const { list, total, missing, shown } = counts
  if (list === 'incomplete') {
    return translate('params.status.incomplete', { total, missing: missing.length, indexes: missing.join(', ') })
  }
  if (list === 'complete') {
    return shown === total ? translate('params.status.all', { total }) : translate('params.status.some', { shown, total })
  }

  return translate(NO_LIST[list])
}

/**
 * Whether the Download button does anything now.
 *
 * @param connection the connection's state
 * @param list how the list stands
 * @returns true when connected and not already downloading
 */
export function canDownload(connection: State['connection']['state'], list: State['list']): boolean {
  return connection === 'connected' && list !== 'loading'
}
