// What a write that stopped says: exactly which parameters were written and read back, which were written and not confirmed (with
// why), and which were never written. A write that went through whole says nothing here (the page says "written and read back").
import type { PanelOutcome } from '@/composables/useParamPanel'

/**
 * The lines of a write that stopped before it was whole.
 *
 * @param outcome how the write went, or null when none was made
 * @param line makes a line: which part it is (`confirmed`, `notConfirmed`, `notWritten`) and the names, joined
 * @returns the lines, a line for each part that has parameters; none when the write was whole
 */
export function outcomeLines(outcome: PanelOutcome | null, line: (part: string, names: string) => string): string[] {
  if (outcome === null || (outcome.notConfirmed.length === 0 && outcome.notWritten.length === 0)) {
    return []
  }
  const parts: [string, string[]][] = [
    ['confirmed', outcome.confirmed],
    ['notConfirmed', outcome.notConfirmed.map(one => `${one.id} (${one.detail})`)],
    ['notWritten', outcome.notWritten],
  ]

  return parts.filter(([, names]) => names.length > 0).map(([part, names]) => line(part, names.join(', ')))
}
