// What the parameter list shows, from plain values (no DOM). Vue's templates escape the text.
import type { Param } from './generated/app'
import type { State } from './configurator'

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

/** What the status line says while there is no list to describe. */
const NO_LIST: Record<'none' | 'loading' | 'failed', string> = {
  none: 'Connect to download the parameters.',
  loading: 'Downloading the parameters…',
  failed: 'The download failed.',
}

/**
 * How the parameter list stands.
 *
 * @param list `loading`, or how the last download ended
 * @param total how many parameters there are
 * @param missing the indexes that never arrived
 * @param shown how many pass the filter
 * @returns the sentence for the list's status line
 */
export function listStatusText(list: State['list'], total: number, missing: number[], shown: number): string {
  if (list === 'incomplete') {
    return `${total} parameters, but ${missing.length} never arrived (indexes ${missing.join(', ')}). `
      + 'Download again to retry.'
  }
  if (list === 'complete') {
    return shown === total ? `${total} parameters` : `${shown} of ${total} parameters`
  }

  return NO_LIST[list]
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
