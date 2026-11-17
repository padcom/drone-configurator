// What can be done to the plan, as the Command pattern has it: each edit is an object that knows how to do itself and how to take
// itself back, so the history (history.ts) is only a list of them. Nothing here draws or knows Vue; it works on a `PlanDocument`.
import { type PlanDocument, type PlanItem, indexOfItem } from './model'

/** MAV_CMD_DO_JUMP: its first parameter is the item (its number, from 1) to go on from. */
const DO_JUMP = 177

/** How long after a change to a field a change to the same field still joins it (ms). */
export const MERGE_MS = 1500

/** One thing done to the plan. */
export interface Edit {
  /** The message that says what it was (for the Undo button and the palette). */
  readonly labelKey: string
  /** Does it (again, after an undo). */
  apply(doc: PlanDocument): void
  /** Takes it back. */
  revert(doc: PlanDocument): void
  /** Takes a later edit that is about the same thing into itself (typing in one field is one edit); true when it did. */
  merge?(next: Edit, now: number): boolean
}

/** The jumps of a plan whose target an edit moved: what each said before. */
interface Retarget {
  /** The jump's item. */
  id: number
  /** What its first parameter said before. */
  before: number | null
}

/**
 * The target a jump has once an item was put in at `seq`: the items from there on move up one.
 *
 * @param to the target (the number of an item, from 1)
 * @param seq the number the new item has
 * @returns the new target
 */
function afterInsert(to: number, seq: number): number {
  return to >= seq ? to + 1 : to
}

/**
 * The target a jump has once the item at `seq` was taken out: the items after it move down one, and a jump to it has no target.
 *
 * @param to the target
 * @param seq the number the item had
 * @returns the new target, or null
 */
function afterRemove(to: number, seq: number): number | null {
  if (to === seq) {
    return null
  }

  return to > seq ? to - 1 : to
}

/**
 * The jumps of a plan that have a target.
 *
 * @param doc the document
 * @returns them
 */
function jumpsOf(doc: PlanDocument): PlanItem[] {
  return doc.plan.items.filter(item => item.command === DO_JUMP && item.p1 !== null)
}

/**
 * Moves the targets of the jumps when an item is put in or taken out: a jump names the item it goes on from by its number, which
 * the other items' numbers change under it. A jump to an item that was taken out has no target (the plan says so: it is a
 * problem).
 *
 * @param doc the document
 * @param seq the number (from 1) the item has, that was put in or taken out
 * @param inserted true when an item was put in at `seq`, false when it was taken out
 * @returns what each jump that moved said before, for taking it back
 */
function retarget(doc: PlanDocument, seq: number, inserted: boolean): Retarget[] {
  const moved: Retarget[] = []
  for (const item of jumpsOf(doc)) {
    const before = item.p1 as number
    const after = inserted ? afterInsert(before, seq) : afterRemove(before, seq)
    if (after !== before) {
      moved.push({ id: item.id, before })
      item.p1 = after
    }
  }

  return moved
}

/**
 * Puts the targets of the jumps back as they were.
 *
 * @param doc the document
 * @param moved what each said
 */
function restore(doc: PlanDocument, moved: readonly Retarget[]): void {
  for (const one of moved) {
    const item = doc.plan.items.find(candidate => candidate.id === one.id)
    if (item) {
      item.p1 = one.before
    }
  }
}

/** An item put in the list, and selected. */
export class AddItem implements Edit {
  readonly labelKey = 'plan.edit.add'
  private moved: Retarget[] = []
  private before: number | null = null

  constructor(private readonly item: PlanItem, private readonly index: number) {}

  apply(doc: PlanDocument): void {
    this.before = doc.selected
    doc.plan.items.splice(this.index, 0, { ...this.item })
    this.moved = retarget(doc, this.index + 1, true)
    doc.selected = this.item.id
  }

  revert(doc: PlanDocument): void {
    const at = indexOfItem(doc.plan, this.item.id)
    if (at >= 0) {
      doc.plan.items.splice(at, 1)
    }
    restore(doc, this.moved)
    doc.selected = this.before
  }
}

/** An item taken out of the list. */
export class RemoveItem implements Edit {
  readonly labelKey = 'plan.edit.remove'
  private item: PlanItem | null = null
  private index = -1
  private moved: Retarget[] = []
  private before: number | null = null

  constructor(private readonly id: number) {}

  apply(doc: PlanDocument): void {
    this.index = indexOfItem(doc.plan, this.id)

    if (this.index < 0) {
      return
    }

    this.before = doc.selected
    this.item = { ...doc.plan.items[this.index] as PlanItem }
    doc.plan.items.splice(this.index, 1)
    this.moved = retarget(doc, this.index + 1, false)
    // the one that took its place is selected, else the one before it
    const next = doc.plan.items[this.index] ?? doc.plan.items[this.index - 1]
    doc.selected = next ? next.id : null
  }

  revert(doc: PlanDocument): void {
    if (this.item === null || this.index < 0) {
      return
    }
    restore(doc, this.moved)
    doc.plan.items.splice(this.index, 0, { ...this.item })
    doc.selected = this.before
  }
}

/**
 * A target after two items swapped places: the one that names either names the other.
 *
 * @param to the target
 * @param one the number of one of the two
 * @param other the number of the other
 * @returns the new target
 */
function swapped(to: number | null, one: number, other: number): number | null {
  if (to === one) {
    return other
  }

  return to === other ? one : to
}

/** An item moved up or down the list (the jumps that name items follow what they named). */
export class MoveItem implements Edit {
  readonly labelKey = 'plan.edit.move'

  constructor(private readonly id: number, private readonly by: -1 | 1) {}

  /**
   * Swaps the item with its neighbour, and the jumps' targets with it.
   *
   * @param doc the document
   * @param by which way
   */
  private swap(doc: PlanDocument, by: number): void {
    const from = indexOfItem(doc.plan, this.id)
    const to = from + by
    const a = doc.plan.items[from]
    const b = doc.plan.items[to]
    if (!a || !b) {
      return
    }

    doc.plan.items[from] = b
    doc.plan.items[to] = a

    // (numbers from 1: the two that swapped places swap the targets that name them)
    for (const jump of jumpsOf(doc)) {
      jump.p1 = swapped(jump.p1, from + 1, to + 1)
    }
  }

  apply(doc: PlanDocument): void {
    this.swap(doc, this.by)
  }

  revert(doc: PlanDocument): void {
    this.swap(doc, -this.by)
  }
}

/**
 * A change to one item's fields. Typing in a field is one edit: the changes of the same fields that come quickly after each
 * other join.
 */
export class UpdateItem implements Edit {
  readonly labelKey = 'plan.edit.change'
  private before: PlanItem | null = null
  private after: PlanItem | null = null
  private at = 0

  /**
   * An edit of some fields of an item.
   *
   * @param id the item
   * @param patch what changes
   * @param now the time (ms)
   * @param joinable whether it may become one edit with the ones before and after it (typing may; a drag of a pin is a step of
   * its own)
   */
  constructor(
    private readonly id: number,
    private readonly patch: Partial<PlanItem>,
    now: number = Date.now(),
    private readonly joinable = true,
  ) {
    this.at = now
  }

  apply(doc: PlanDocument): void {
    const item = doc.plan.items.find(candidate => candidate.id === this.id)
    if (!item) {
      return
    }
    if (this.after !== null) {
      // (done again after an undo: the item becomes what it was after the edit, merged ones included)
      Object.assign(item, this.after)

      return
    }
    this.before = { ...item }
    Object.assign(item, this.patch)
    this.after = { ...item }
  }

  revert(doc: PlanDocument): void {
    const item = doc.plan.items.find(candidate => candidate.id === this.id)
    if (item && this.before) {
      Object.assign(item, this.before)
    }
  }

  /**
   * Whether a later edit is a change of the same fields of the same item, soon enough to be one edit with this.
   *
   * @param next the later edit
   * @param now the time (ms)
   * @returns whether it is
   */
  private joins(next: Edit, now: number): next is UpdateItem {
    return next instanceof UpdateItem && this.mayJoin(next, now) && Object.keys(next.patch).every(key => key in this.patch)
  }

  /**
   * Whether a later change is of the same item, soon enough, and both are of the kind that joins.
   *
   * @param next the later change
   * @param now the time (ms)
   * @returns whether it may
   */
  private mayJoin(next: UpdateItem, now: number): boolean {
    return this.joinable && next.joinable && next.id === this.id && now - this.at <= MERGE_MS
  }

  merge(next: Edit, now: number): boolean {
    if (!this.joins(next, now)) {
      return false
    }
    // (the one that was applied last is `next`: what it left is what this one now leaves)
    this.after = next.after
    this.at = now

    return true
  }
}

/** The plan given another name. */
export class RenamePlan implements Edit {
  readonly labelKey = 'plan.edit.rename'
  private before = ''
  private at = 0

  constructor(private name: string, now: number = Date.now()) {
    this.at = now
  }

  apply(doc: PlanDocument): void {
    this.before = doc.plan.name
    doc.plan.name = this.name
  }

  revert(doc: PlanDocument): void {
    doc.plan.name = this.before
  }

  merge(next: Edit, now: number): boolean {
    if (!(next instanceof RenamePlan) || now - this.at > MERGE_MS) {
      return false
    }
    this.name = next.name
    this.at = now

    return true
  }
}
