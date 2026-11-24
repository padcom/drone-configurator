// What the review and the comparison say of a value that a file or a snapshot names as an older firmware did (#202): the old and
// the new name with the release that renamed it, and both values when the firmware converts it (3000 cm → 30 m), so that both
// are seen before anything is written. From plain values (no DOM); the words come from the translations.
import type { Translate } from '@/lib/fly/telemetryCards'
import { showNumber } from './paramValue'
import type { Renamed } from './renames'

/** The words beside a renamed value. */
export interface RenamedWords {
  /** The old and the new name, and the release that renamed it. */
  name: string
  /** The value before and after the conversion, or null when the firmware keeps the value as it is. */
  value: string | null
}

/**
 * A value with its unit, when it has one.
 *
 * @param value the value
 * @param unit its unit, if known
 * @returns `3000 cm`, or the number alone
 */
export function withUnit(value: number, unit: string | undefined): string {
  return unit === undefined ? showNumber(value) : `${showNumber(value)} ${unit}`
}

/**
 * The words beside a value under its new name.
 *
 * @param id the new name (the vehicle's)
 * @param to the value under the new name
 * @param renamed the old name and value
 * @param translate looks up a message
 * @returns the words
 */
export function renamedWords(id: string, to: number, renamed: Renamed, translate: Translate): RenamedWords {
  const name = translate('import.renamed', { from: renamed.from, to: id, since: renamed.since })
  const before = withUnit(renamed.value, renamed.units?.from)
  const after = withUnit(to, renamed.units?.to)

  return { name, value: renamed.value === to ? null : translate('import.converted', { from: before, to: after }) }
}

/**
 * The other side's value of a comparison's row whose name the other side has as an older firmware did: the value under the
 * vehicle's name, then the old name and value.
 *
 * @param shown the value as the row shows it (with its name or units from the metadata)
 * @param renamed the old name and value
 * @param translate looks up a message
 * @returns the text
 */
export function renamedOther(shown: string, renamed: Renamed, translate: Translate): string {
  const old = withUnit(renamed.value, renamed.units?.from)

  return translate('compare.renamed', { value: shown, from: renamed.from, old, since: renamed.since })
}
