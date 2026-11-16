// The list of what was done to the plan, for Undo and Redo: the edits (edit.ts) in the order they were done, and the ones that
// were taken back and can be done again. A new edit empties what could be redone. Nothing here knows Vue.
import type { Edit } from './edit'
import type { PlanDocument } from './model'

/** The most edits kept. */
export const HISTORY_LIMIT = 200

/** What was done, and what was taken back. */
export class History {
  private done: Edit[] = []
  private undone: Edit[] = []

  /**
   * Does an edit and keeps it (it joins the last one when it is the same typing).
   *
   * @param doc the document
   * @param edit the edit
   * @param now the time (ms), for what joins
   */
  run(doc: PlanDocument, edit: Edit, now: number = Date.now()): void {
    edit.apply(doc)
    this.undone = []

    if (this.joinsLast(edit, now)) {
      return
    }

    this.done.push(edit)

    if (this.done.length > HISTORY_LIMIT) {
      this.done.shift()
    }
  }

  /**
   * Whether the last edit took this one into itself.
   *
   * @param edit the edit
   * @param now the time (ms)
   * @returns whether it did
   */
  private joinsLast(edit: Edit, now: number): boolean {
    const last = this.done.at(-1)

    return last?.merge?.(edit, now) ?? false
  }

  /**
   * Whether there is something to take back.
   *
   * @returns whether there is
   */
  canUndo(): boolean {
    return this.done.length > 0
  }

  /**
   * Whether there is something to do again.
   *
   * @returns whether there is
   */
  canRedo(): boolean {
    return this.undone.length > 0
  }

  /**
   * The message that says what Undo would take back.
   *
   * @returns the key, or null
   */
  undoLabelKey(): string | null {
    return this.done.at(-1)?.labelKey ?? null
  }

  /**
   * The message that says what Redo would do again.
   *
   * @returns the key, or null
   */
  redoLabelKey(): string | null {
    return this.undone.at(-1)?.labelKey ?? null
  }

  /**
   * Takes the last edit back.
   *
   * @param doc the document
   * @returns whether there was one
   */
  undo(doc: PlanDocument): boolean {
    const edit = this.done.pop()
    if (!edit) {
      return false
    }
    edit.revert(doc)
    this.undone.push(edit)

    return true
  }

  /**
   * Does the edit that was taken back again.
   *
   * @param doc the document
   * @returns whether there was one
   */
  redo(doc: PlanDocument): boolean {
    const edit = this.undone.pop()
    if (!edit) {
      return false
    }
    edit.apply(doc)
    this.done.push(edit)

    return true
  }

  /** Forgets everything (a plan that was opened or cleared starts a history of its own). */
  clear(): void {
    this.done = []
    this.undone = []
  }
}
