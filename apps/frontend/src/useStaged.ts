// Parameter changes collected to be written together: "Add to changes" stages the selected parameter's draft, and "Write N
// and verify" sends them one after the other, each read back, stopping at the first the vehicle does not confirm. A change is
// only done when the vehicle reports the new value; nothing is written until the user asks, after one question for all.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from './backend/client'
import { CALIBRATION_NOTE, isCalibration } from './calibrationParams'
import type { Connection, Param } from './generated/app'
import type { ParamsModel } from './useParams'

/** One change collected to be written. */
export interface StagedChange {
  /** The parameter's name. */
  id: string
  /** Its value on the vehicle when the change was added. */
  from: number
  /** The value to write. */
  to: number
  /** What the metadata found unusual about it when it was added (the question says so), if anything. */
  warning?: string
  /** Where it came from: typed by the user (`edit`, the default), or the initial value put back (`reset`). */
  origin?: 'edit' | 'reset'
}

/** How a staged change went when it was written. */
export interface StagedResult {
  /** The parameter's name. */
  id: string
  /** Whether the vehicle read back what was written, reported another value, or the write failed. */
  outcome: 'verified' | 'changed' | 'failed'
  /** What to tell the user: the value read back, or why not. */
  detail: string
}

/** What the staged changes need from the rest of the interface. */
export interface StagedDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The parameters (the selected one and its draft, and the list to update after a write). */
  parameters: ParamsModel
  /** Whether a vehicle is connected. */
  isConnected: () => boolean
  /** Asks the user to confirm `question`; the writes go ahead only on true. */
  confirm: (question: string) => Promise<boolean>
}

/** The staged changes, as refs and actions. */
export interface StagedModel {
  /** The changes, in the order they were added. */
  readonly changes: ShallowRef<StagedChange[]>
  /**
   * How each change that was written and not confirmed went, in order. (A change the vehicle read back is done: it leaves the
   * changes, and is counted in `written`.)
   */
  readonly results: ShallowRef<StagedResult[]>
  /** Goes up with every run in which all the changes were read back: how many there were. Null until then. */
  readonly written: ShallowRef<{ count: number } | null>
  /** Goes up each time queued resets were taken out because the vehicle has their value already: how many. Null until then. */
  readonly matched: ShallowRef<{ count: number } | null>
  /**
   * Takes out the changes whose value the vehicle has now (a download after they were queued, a write by another ground
   * station): there is nothing left to write for them. Not while the changes are being written.
   */
  dropMatching: () => void
  /** How many changes of the last run the vehicle read back (they have left the list): what a run that stopped says it did. */
  readonly readBack: ShallowRef<number>
  /** Whether the writes are under way. */
  readonly writing: ShallowRef<boolean>
  /**
   * Makes the changes follow the draft of the selected parameter: a valid value that differs from the vehicle's is queued (in
   * place of an earlier one for the same parameter), the vehicle's own value takes the change out, and an empty or invalid
   * draft leaves the changes as they are.
   */
  sync: () => void
  /** Takes a change that has not been written out of the list. */
  discard: (id: string) => void
  /**
   * Queues the putting back of parameters to values (their initial ones), each in place of any change queued for it, and the
   * vehicle's own value takes the change out. Nothing is written: the question is asked when the changes are.
   *
   * @returns how many are queued now
   */
  resetTo: (targets: { id: string, to: number }[]) => number
  /** Forgets every change and result (the session ended, or another vehicle was connected). */
  reset: () => void
  /** Writes the changes that are not written yet, after one question, and stops at the first that is not confirmed. */
  writeAll: () => Promise<void>
  /** The changes that have not been written. */
  pending: () => StagedChange[]
}

/**
 * What the user is asked before the changes are written: how many, then a line for each change with the value it has and the
 * value it is given (this question is the gate: what is queued, "1500 → 1" included, is said here), and what the metadata finds
 * unusual about it.
 *
 * @param changes the changes to write
 * @returns the question, one line for the sentence and one for each change
 */
export function questionFor(changes: StagedChange[]): string {
  const noun = changes.length === 1 ? 'parameter' : 'parameters'
  const lines = changes.map(change => `${change.id} ${change.from} → ${change.to}${change.warning ? ` (${change.warning})` : ''}`)
  // Said at the top, where a long list that scrolls does not hide it.
  const note = changes.some(change => isCalibration(change.id)) ? [CALIBRATION_NOTE] : []

  return [`Write ${changes.length} ${noun} to the vehicle?`, ...note, ...lines].join('\n')
}

/**
 * Whether the connection went from one session to another, so that what was staged belongs to a vehicle that is gone: the
 * link was ended (disconnected), or a link came up that is not the same vehicle coming back (`connected` without `resumed`).
 * A link that is lost and brought back to the same vehicle keeps the changes.
 *
 * @param next the connection now
 * @param before the connection before
 * @returns true when the staged changes are to be forgotten
 */
export function endsSession(next: Connection, before: Connection): boolean {
  if (next.state === before.state) {
    return false
  }

  return next.state === 'disconnected' || (next.state === 'connected' && next.resumed !== true)
}

/** The staged changes. */
class Staged implements StagedModel {
  readonly changes = shallowRef<StagedChange[]>([])
  readonly results = shallowRef<StagedResult[]>([])
  readonly written = shallowRef<{ count: number } | null>(null)
  readonly matched = shallowRef<{ count: number } | null>(null)
  readonly writing = shallowRef(false)
  readonly readBack = shallowRef(0)
  /** Goes up when the changes are forgotten, so that a run that was under way knows it is over. */
  private epoch = 0
  /** Gives back the lock the run holds, while it holds it. */
  private release: (() => void) | null = null

  /**
   * Makes the staged changes.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: StagedDeps) {}

  pending(): StagedChange[] {
    return this.changes.value
  }

  /**
   * The draft of the selected parameter, if it is a value (not empty, not an error): what the changes follow.
   *
   * @returns the parameter and the value typed for it, or null
   */
  private draftOf(): { param: Param, value: number } | null {
    const { parameters } = this.deps
    const param = parameters.selectedParam()
    const text = parameters.draft.value.trim()
    const usable = [param !== null, text !== '', parameters.draftError.value === null].every(Boolean)

    return usable && param ? { param, value: Number(text) } : null
  }

  /**
   * The change for the draft, with what the metadata finds unusual about it, if anything.
   *
   * @param param the selected parameter
   * @param to the value to write
   * @returns the change
   */
  private changeFor(param: Param, to: number): StagedChange {
    // Read again now: the metadata may have been loaded or replaced since the draft was typed.
    const warning = this.deps.parameters.refreshWarning()

    return warning ? { id: param.id, from: param.value, to, warning } : { id: param.id, from: param.value, to }
  }

  /**
   * Queues the value (in place of an earlier change for the same parameter).
   *
   * @param param the parameter
   * @param to the value to write
   * @param origin `reset` for the initial value put back (it has no warning of the draft to carry), else `edit`
   */
  private queue(param: Param, to: number, origin: 'edit' | 'reset' = 'edit'): void {
    const kept = this.changes.value.filter(change => change.id !== param.id)
    const queued: StagedChange = origin === 'reset' ? { id: param.id, from: param.value, to, origin } : this.changeFor(param, to)
    this.changes.value = [...kept, queued]
    // The words about the rows that stay (why one was not confirmed) stay with them; the rest go.
    this.results.value = this.results.value.filter(result => kept.some(change => change.id === result.id))
  }

  /**
   * Puts one parameter back to a value: queued in place of any change for it, or the change taken out when the vehicle has the
   * value already.
   *
   * @param id the parameter
   * @param to the value
   * @returns true if a change is queued now
   */
  private resetOne(id: string, to: number): boolean {
    const param = this.deps.parameters.params.value.find(candidate => candidate.id === id)

    return param ? this.putBack(param, to) : false
  }

  /**
   * Queues the value for a parameter (or takes its change out when it has the value), and the Value field of the selected
   * parameter says what will be written for it.
   *
   * @param param the parameter
   * @param to the value
   * @returns true if a change is queued now
   */
  private putBack(param: Param, to: number): boolean {
    const { parameters } = this.deps
    const differs = to !== param.value
    if (differs) {
      this.queue(param, to, 'reset')
    } else {
      this.discard(param.id)
    }
    if (parameters.selectedParam()?.id === param.id) {
      parameters.editDraft(String(to))
    }

    return differs
  }

  dropMatching(): void {
    if (this.writing.value) {
      return
    }
    const now = new Map(this.deps.parameters.params.value.map(param => [param.id, param.value]))
    const gone = this.changes.value.filter(change => now.get(change.id) === change.to)
    if (gone.length === 0) {
      return
    }
    this.changes.value = this.changes.value.filter(change => !gone.includes(change))
    this.results.value = this.results.value.filter(result => this.changes.value.some(change => change.id === result.id))
    const resets = gone.filter(change => change.origin === 'reset').length
    if (resets > 0) {
      this.matched.value = { count: resets }
    }
  }

  resetTo(targets: { id: string, to: number }[]): number {
    return this.writing.value ? 0 : targets.filter(({ id, to }) => this.resetOne(id, to)).length
  }

  sync(): void {
    const draft = this.draftOf()
    if (!draft || this.writing.value) {
      return
    }
    if (draft.value === draft.param.value) {
      this.discard(draft.param.id)
    } else {
      this.queue(draft.param, draft.value)
    }
  }

  reset(): void {
    // A run that is under way is over: it writes no more, adds no late result, and gives the lock back at once. (The lock is
    // free while a write that was already sent may still be answering: its answer is dropped, and the next session starts
    // by listing the parameters again.)
    this.epoch += 1
    this.release?.()
    this.release = null
    this.writing.value = false
    this.changes.value = []
    this.results.value = []
    this.written.value = null
    this.matched.value = null
    this.readBack.value = 0
    // The Value field does not keep a value that was queued for a vehicle that is gone.
    const param = this.deps.parameters.selectedParam()
    if (param) {
      this.deps.parameters.editDraft(String(param.value))
    }
  }

  discard(id: string): void {
    if (this.writing.value) {
      return
    }
    this.changes.value = this.changes.value.filter(change => change.id !== id)
    // The Value field of that parameter goes back to what the vehicle has, as it no longer says what will be written.
    const { parameters } = this.deps
    const param = parameters.selectedParam()
    if (param?.id === id) {
      parameters.editDraft(String(param.value))
    }
  }

  /**
   * Writes one change and says how it went.
   *
   * @param change the change
   * @returns how it went
   */
  private async writeOne(change: StagedChange): Promise<StagedResult> {
    const param: Param | undefined = this.deps.parameters.params.value.find(candidate => candidate.id === change.id)
    if (!param) {
      return { id: change.id, outcome: 'failed', detail: 'not on this vehicle' }
    }
    try {
      const { id, kind, type } = param
      const result = await this.deps.client.call('params.write', { id, kind, type, value: change.to })
      this.deps.parameters.replace(result.param)

      return result.verified
        ? { id, outcome: 'verified', detail: `${result.param.value}` }
        : { id, outcome: 'changed', detail: `the vehicle reports ${result.param.value}, not ${change.to}` }
    } catch (error) {
      return { id: change.id, outcome: 'failed', detail: describeError(error) }
    }
  }

  /**
   * Writes the changes one after the other, until one is not confirmed.
   *
   * @param changes the changes still to write
   * @param epoch the run these belong to
   */
  private async writeFrom(changes: StagedChange[], epoch: number): Promise<void> {
    const [change, ...rest] = changes
    if (!this.stillStaged(change, epoch)) {
      return
    }
    const result = await this.writeOne(change)
    if (epoch !== this.epoch) {
      return
    }
    if (result.outcome === 'verified') {
      // Done: it leaves the list, and the next one is written.
      this.changes.value = this.changes.value.filter(staged => staged.id !== change.id)
      this.readBack.value += 1
      await this.writeFrom(rest, epoch)
    } else {
      this.results.value = [...this.results.value, result]
    }
  }

  /**
   * Whether a change is there and still in the list of this run (the changes were not forgotten meanwhile).
   *
   * @param change the next change, if there is one
   * @param epoch the run
   * @returns true if it is still to be written
   */
  private stillStaged(change: StagedChange | undefined, epoch: number): change is StagedChange {
    return change !== undefined && epoch === this.epoch && this.changes.value.some(staged => staged.id === change.id)
  }

  /**
   * Whether the writes can start now: there are changes, a vehicle is connected, and nothing is being written.
   *
   * @param todo the changes not written yet
   * @returns true if they can
   */
  private startable(todo: StagedChange[]): boolean {
    // Not while the list is being downloaded: the values in it, and the initial ones taken from it, would be half and half.
    // (A download is not started while the changes are written either: ParamsModel.refresh.)
    const idle = !this.writing.value && this.deps.parameters.list.value !== 'loading'

    return todo.length > 0 && idle && this.deps.isConnected()
  }

  /**
   * The changes with the value each parameter has now as the one it goes from: the question is made when it is asked, from
   * what the vehicle has, not from what it had when the change was queued (another ground station, or a download, may have
   * changed it).
   *
   * @param todo the changes to write
   * @returns the same changes, with the current `from`
   */
  private withCurrentValues(todo: StagedChange[]): StagedChange[] {
    const now = new Map(this.deps.parameters.params.value.map(param => [param.id, param.value]))

    return todo.map(change => ({ ...change, from: now.get(change.id) ?? change.from }))
  }

  async writeAll(): Promise<void> {
    const todo = this.pending()
    if (!this.startable(todo)) {
      return
    }
    const { epoch } = this
    // The lock is taken after the answer: the question is a modal dialog, and a button turned off behind it would lose the
    // focus that the dialog gives back.
    if (await this.deps.confirm(questionFor(this.withCurrentValues(todo))) && epoch === this.epoch) {
      await this.writeLocked(todo, epoch)
    }
  }

  /**
   * Writes while no other write (a single one, a snapshot) is under way, and gives the lock back however it ends.
   *
   * @param todo the changes not written yet
   * @param epoch the run
   */
  private async writeLocked(todo: StagedChange[], epoch: number): Promise<void> {
    const release = this.deps.parameters.lock.take()
    if (!release) {
      return
    }
    this.release = release

    try {
      await this.writeConfirmed(todo, epoch)
    } finally {
      release()
    }
  }

  /**
   * Writes the changes the user said yes to. What the vehicle already read back stays read back; the rest is tried again.
   *
   * @param todo the changes not written yet
   * @param epoch the run
   */
  private async writeConfirmed(todo: StagedChange[], epoch: number): Promise<void> {
    this.writing.value = true
    this.results.value = []
    this.readBack.value = 0

    try {
      await this.writeFrom(todo, epoch)
    } finally {
      // After a reset the run is over already, and `writing` may belong to a newer one.
      if (epoch === this.epoch) {
        this.writing.value = false
        this.finish(todo.length)
      }
    }
  }

  /**
   * Says that the run is over, if every change of it was read back.
   *
   * @param count how many changes the run had
   */
  private finish(count: number): void {
    if (this.readBack.value === count && count > 0) {
      this.written.value = { count }
    }
  }
}

/**
 * Makes the staged changes.
 *
 * @param deps the client and the rest of the interface
 * @returns the changes and the actions
 */
export function useStaged(deps: StagedDeps): StagedModel {
  return new Staged(deps)
}
