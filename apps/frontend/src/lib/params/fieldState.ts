// What a field bound to a parameter says about it, from plain values: the vehicle's value, the draft the person has
// made, the write of that draft (under way, verified by a read back, or rejected), and the one case that needs a word
// from the person: the vehicle changed the parameter itself (a calibration, a tune, another program) while there was a
// draft over it.

/** Where a write is. */
export type WriteState = 'idle' | 'writing' | 'verified' | 'rejected'

/** What the field knows. */
export interface FieldFacts {
  /** What the vehicle holds now (undefined: it has not said). */
  vehicle: number | undefined
  /** The draft the person has made (null: none). */
  draft: number | null
  /** What the vehicle held when the draft was begun: if it holds another value now, it changed under the draft. */
  basis: number | undefined
  /** Where the write of the draft is. */
  write: WriteState
}

/** What the field shows. */
export type FieldStatus = 'unknown' | 'vehicle' | 'draft' | 'writing' | 'verified' | 'rejected' | 'conflict'

/**
 * The status of a field with a draft and no write.
 *
 * @param facts what the field knows
 * @param vehicle the vehicle's value
 * @param draft the draft
 * @returns the status
 */
function draftStatus(facts: FieldFacts, vehicle: number, draft: number): FieldStatus {
  if (facts.basis !== undefined && facts.basis !== vehicle) {
    return 'conflict'
  }

  return draft === vehicle ? 'vehicle' : 'draft'
}

/**
 * The status of a field. A write that is under way, verified or rejected is said first, whatever else is true; then a draft
 * over a value the vehicle changed (a conflict); then a draft that is not the vehicle's value (modified); else the vehicle's.
 *
 * @param facts what the field knows
 * @returns the status
 */
export function statusOf(facts: FieldFacts): FieldStatus {
  if (facts.vehicle === undefined) {
    return 'unknown'
  }
  if (facts.write !== 'idle') {
    return facts.write
  }

  return facts.draft === null ? 'vehicle' : draftStatus(facts, facts.vehicle, facts.draft)
}

/**
 * The value a field shows: the draft when there is one, else what the vehicle holds.
 *
 * @param facts what the field knows
 * @returns the value (undefined when the vehicle has not said and there is no draft)
 */
export function shownValue(facts: FieldFacts): number | undefined {
  return facts.draft ?? facts.vehicle
}

/** How a conflict is settled: the draft is kept over the vehicle's new value, or the vehicle's value is taken. */
export type Choice = 'keep' | 'take'

/**
 * The draft and its basis once a conflict is settled. Keeping the draft makes the vehicle's new value its basis (the person has
 * seen it: the draft is still theirs, and it is no conflict any more); taking the vehicle's value drops the draft.
 *
 * @param choice how the conflict is settled
 * @param facts what the field knows
 * @returns the draft and its basis
 */
export function settled(choice: Choice, facts: FieldFacts): Pick<FieldFacts, 'draft' | 'basis'> {
  return choice === 'keep' ? { draft: facts.draft, basis: facts.vehicle } : { draft: null, basis: undefined }
}
