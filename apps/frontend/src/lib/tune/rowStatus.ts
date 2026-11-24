// Which parameter of a Tune row says how the row stands. A slider may set two parameters (a linked roll and pitch): they move
// together, so one line of words says for both, and it is the one that most needs saying (a conflict, then a rejected write, a
// write under way, a draft, a verified write; the vehicle's value last).
import { type FieldFacts, type FieldStatus, statusOf } from '@/lib/params/fieldState'

/** The statuses, the one that most needs saying first. */
const RANK: readonly FieldStatus[] = ['conflict', 'rejected', 'writing', 'draft', 'verified', 'unknown', 'vehicle']

/**
 * The parameter of a row whose status the row says.
 *
 * @param ids the row's parameters
 * @param factsOf what the field of a parameter knows
 * @returns the parameter (the empty text for none)
 */
export function sayingId(ids: readonly string[], factsOf: (id: string) => FieldFacts): string {
  const ranked = ids.map(id => ({ id, rank: RANK.indexOf(statusOf(factsOf(id))) }))

  return ranked.reduce((best, next) => (next.rank < best.rank ? next : best), { id: '', rank: RANK.length }).id
}
