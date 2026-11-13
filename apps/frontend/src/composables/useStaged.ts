// Parameter changes collected to be written together: "Add to changes" stages the selected parameter's draft, and "Write N
// and verify" sends them one after the other, each read back, stopping at the first the vehicle does not confirm. A change is
// only done when the vehicle reports the new value; nothing is written until the user asks, after one question for all.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import { say } from '@/i18n/say'
import { includesGuarded } from '@/lib/logs/loggingSetup'
import { isCalibration } from '@/lib/params/calibrationParams'
import type { Connection, Param, ParamWrite } from '@/generated/app'
import { canonical, notConfirmedText, showNumber, typedValue } from '@/lib/params/paramValue'
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
  /**
   * Set when a Setup page queued it: it is not written while the vehicle is armed, or may be (unknown counts as armed), and the
   * backend refuses it then too. A change from the Parameters screen is not guarded.
   */
  guarded?: boolean
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

/** How values from another page are queued. */
export interface StageOptions {
  /** The page is a Setup page: the changes are refused while the vehicle is armed, or may be, here and in the backend. */
  guarded?: boolean
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
  /** Whether the vehicle is armed or may be (unknown counts as armed): logging settings are neither queued nor written then. */
  mayBeArmed?: () => boolean
}

/** The staged changes, as refs and actions. */
export interface StagedModel {
  /** The changes, in the order they were added. */
  readonly changes: ShallowRef<StagedChange[]>
  /** Why the last attempt to queue a change was refused (armed or unknown, and a guarded parameter), or null. */
  readonly refused: ShallowRef<string | null>
  /**
   * How each change that was written and not confirmed went, in order. (A change the vehicle read back is done: it leaves the
   * changes, and is counted in `written`.)
   */
  readonly results: ShallowRef<StagedResult[]>
  /** Goes up with every run in which all the changes were read back: how many there were. Null until then. */
  readonly written: ShallowRef<{ count: number } | null>
  /** Goes up each time queued resets were taken out because the vehicle has their value already: how many. Null until then. */
  readonly matched: ShallowRef<{ count: number } | null>
  /** Goes up each time a run left changes out because they were taken out while its question was open: how many. */
  readonly leftOut: ShallowRef<{ count: number } | null>
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
  /**
   * Queues new values chosen on another page (the Logging setup), each in place of any change queued for it; the vehicle's own
   * value takes the change out. Nothing is written: the question is asked when the changes are.
   *
   * @returns how many are queued now
   */
  stage: (targets: { id: string, to: number }[], options?: StageOptions) => number
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
  const values = (change: StagedChange) => `${showNumber(change.from)} → ${showNumber(change.to)}`
  const lines = changes.map(change => `${change.id} ${values(change)}${change.warning ? ` (${change.warning})` : ''}`)
  // Said at the top, where a long list that scrolls does not hide it.
  const note = changes.some(change => isCalibration(change.id)) ? [say('params.initial.includesCalibration')] : []

  return [say('question.write', { count: changes.length }, changes.length), ...note, ...lines].join('\n')
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

/**
 * What `params.write` is sent for a change: a change from a Setup page is marked `guarded`, and the backend refuses it too while
 * the vehicle is armed or not known to be disarmed.
 *
 * @param param the parameter
 * @param change the change
 * @returns the request
 */
function writeOf(param: Param, change: StagedChange): ParamWrite {
  const { id, kind, type } = param

  return { id, kind, type, value: change.to, ...change.guarded ? { guarded: true } : {} }
}

/**
 * A change as a Setup page or another page queues it.
 *
 * @param id the parameter
 * @param from the value on the vehicle
 * @param to the value to write
 * @param guarded whether a Setup page queues it
 * @returns the change
 */
function changeOf(id: string, from: number, to: number, guarded: boolean): StagedChange {
  return guarded ? { id, from, to, guarded } : { id, from, to }
}

/** The staged changes. */
class Staged implements StagedModel {
  readonly changes = shallowRef<StagedChange[]>([])
  readonly refused = shallowRef<string | null>(null)
  readonly results = shallowRef<StagedResult[]>([])
  readonly written = shallowRef<{ count: number } | null>(null)
  readonly matched = shallowRef<{ count: number } | null>(null)
  readonly leftOut = shallowRef<{ count: number } | null>(null)
  /** How many changes of the run under way were taken out while its question was open, and so are left out of it. */
  private skipped = 0
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

    // The number the vehicle would hold for what was typed (a whole number for an integer, the float nearest for a REAL32).
    return usable && param ? { param, value: typedValue(param, text) } : null
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
   * @returns false when the parameter is refused (the vehicle may be armed)
   */
  private queue(param: Param, to: number, origin: 'edit' | 'reset' = 'edit'): boolean {
    if (this.refuses(param.id)) {
      return false
    }
    const kept = this.changes.value.filter(change => change.id !== param.id)
    const queued: StagedChange = origin === 'reset' ? { id: param.id, from: param.value, to, origin } : this.changeFor(param, to)
    this.changes.value = [...kept, queued]
    // The words about the rows that stay (why one was not confirmed) stay with them; the rest go.
    this.results.value = this.results.value.filter(result => kept.some(change => change.id === result.id))

    return true
  }

  /**
   * Whether a parameter is refused while the vehicle is armed, or may be: it is not queued (by any path: an edit, a reset, a
   * value from another page), and the reason is kept for the page to say.
   *
   * @param id the parameter
   * @param guarded whether a Setup page queues it (refused armed whatever the parameter is)
   * @returns true if it is refused
   */
  private refuses(id: string, guarded = false): boolean {
    const message = this.armedMessage(id, guarded)
    if (message === null) {
      return false
    }
    this.refused.value = message

    return true
  }

  /**
   * Why a parameter is not queued now because the vehicle may be armed: a Setup page's change, or a logging or notch parameter.
   *
   * @param id the parameter
   * @param guarded whether a Setup page queues it
   * @returns the words, or null when it may be queued
   */
  private armedMessage(id: string, guarded: boolean): string | null {
    if (!this.mayBeArmed()) {
      return null
    }
    if (guarded) {
      return say('staged.armedSetup')
    }

    return includesGuarded([id]) ? say('staged.armedGuarded') : null
  }

  /**
   * Whether the vehicle is armed or may be (unknown counts as armed).
   *
   * @returns true if it may be
   */
  private mayBeArmed(): boolean {
    return this.deps.mayBeArmed?.() ?? false
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
    const value = canonical(param, to)
    if (Object.is(value, canonical(param, param.value))) {
      this.discard(param.id)
      this.showValue(param, value)

      return false
    }
    const queued = this.queue(param, value, 'reset')
    if (queued) {
      this.showValue(param, value)
    }

    return queued
  }

  /**
   * The Value field of the selected parameter says what will be written for it.
   *
   * @param param the parameter
   * @param value the value
   */
  private showValue(param: Param, value: number): void {
    const { parameters } = this.deps
    if (parameters.selectedParam()?.id === param.id) {
      parameters.editDraft(showNumber(value))
    }
  }

  dropMatching(): void {
    if (this.writing.value) {
      return
    }
    const now = new Map(this.deps.parameters.params.value.map(param => [param.id, canonical(param, param.value)]))
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
    this.refused.value = null

    return this.writing.value ? 0 : targets.filter(({ id, to }) => this.resetOne(id, to)).length
  }

  stage(targets: { id: string, to: number }[], options: StageOptions = {}): number {
    this.refused.value = null
    const guarded = options.guarded === true

    return this.writing.value ? 0 : targets.filter(({ id, to }) => this.stageOne(id, to, guarded)).length
  }

  /**
   * Whether the vehicle can be given a value exactly: it takes a parameter over MAVLink as a 32-bit float, which holds every
   * integer up to 2^24 and above that only some. A value it cannot hold is refused here, not at the write.
   *
   * @param param the parameter
   * @param value the value
   * @returns false for a whole-number parameter and a number a float cannot hold
   */
  private writable(param: Param, value: number): boolean {
    return param.kind !== 'int' || Math.fround(value) === value
  }

  /**
   * Whether a value from another page can be queued: the vehicle can be given it exactly, and the parameter is not refused.
   *
   * @param param the parameter
   * @param value the value
   * @param guarded whether a Setup page queues it
   * @returns true if it can
   */
  private stageable(param: Param, value: number, guarded: boolean): boolean {
    return this.writable(param, value) && !this.refuses(param.id, guarded)
  }

  /**
   * Queues one value (an edit, as if typed), or takes the change out when the vehicle has the value already.
   *
   * @param id the parameter
   * @param to the value
   * @param guarded whether a Setup page queues it (the change is then marked, and not written while the vehicle may be armed)
   * @returns true if a change is queued now
   */
  private stageOne(id: string, to: number, guarded: boolean): boolean {
    const param = this.deps.parameters.params.value.find(candidate => candidate.id === id)
    if (!param) {
      return false
    }
    const value = canonical(param, to)
    if (Object.is(value, canonical(param, param.value))) {
      this.discard(id)

      return false
    }
    if (!this.stageable(param, value, guarded)) {
      return false
    }
    this.put(changeOf(id, param.value, value, guarded))

    return true
  }

  /**
   * Puts a change in the list, in place of any change for the same parameter. (Not `queue`: that carries the warning of the
   * selected parameter's draft, which is another parameter's.)
   *
   * @param change the change
   */
  private put(change: StagedChange): void {
    const kept = this.changes.value.filter(staged => staged.id !== change.id)
    this.changes.value = [...kept, change]
    this.results.value = this.results.value.filter(result => kept.some(staged => staged.id === result.id))
  }

  sync(): void {
    const draft = this.draftOf()
    if (!draft || this.writing.value) {
      return
    }
    this.syncDraft(draft)
  }

  /**
   * Makes the changes follow a draft: the vehicle's own value takes the change out, any other is queued.
   *
   * @param draft the parameter and the value typed for it
   * @param draft.param the parameter
   * @param draft.value the value
   */
  private syncDraft(draft: { param: Param, value: number }): void {
    this.refused.value = null

    if (draft.value === canonical(draft.param, draft.param.value)) {
      this.discard(draft.param.id)
    } else if (this.queue(draft.param, draft.value)) {
      // The field shows the number that will be written (3 for a typed 2.6 of an integer, 0.1 for a float typed as 0.1000000001).
      this.deps.parameters.editDraft(showNumber(draft.value))
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
    this.refused.value = null
    this.results.value = []
    this.written.value = null
    this.matched.value = null
    this.leftOut.value = null
    this.readBack.value = 0
    // The Value field does not keep a value that was queued for a vehicle that is gone.
    const param = this.deps.parameters.selectedParam()
    if (param) {
      this.deps.parameters.editDraft(showNumber(param.value))
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
      parameters.editDraft(showNumber(param.value))
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
      return { id: change.id, outcome: 'failed', detail: say('problem.notOnVehicle') }
    }
    try {
      const { id } = param
      const result = await this.deps.client.call('params.write', writeOf(param, change))
      this.deps.parameters.replace(result.param)

      return result.verified
        ? { id, outcome: 'verified', detail: showNumber(result.param.value) }
        : { id, outcome: 'changed', detail: notConfirmedText(result.param.value, change.to) }
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
    if (change === undefined || epoch !== this.epoch) {
      return
    }
    if (this.changes.value.some(staged => staged.id === change.id)) {
      await this.writeStaged(change, rest, epoch)
    } else {
      // Taken out while the question was open (the vehicle has its value now): left out, and the run goes on with the rest.
      this.skipped += 1
      await this.writeFrom(rest, epoch)
    }
  }

  /**
   * Writes one change, and goes on with the rest when the vehicle read it back.
   *
   * @param change the change
   * @param rest the changes after it
   * @param epoch the run these belong to
   */
  private async writeStaged(change: StagedChange, rest: StagedChange[], epoch: number): Promise<void> {
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
   * Whether the writes can start now: there are changes, a vehicle is connected, and nothing is being written.
   *
   * @param todo the changes not written yet
   * @returns true if they can
   */
  private startable(todo: StagedChange[]): boolean {
    // Not while the list is being downloaded: the values in it, and the initial ones taken from it, would be half and half.
    // (A download is not started while the changes are written either: ParamsModel.refresh.)
    return todo.length > 0 && this.isIdle() && this.deps.isConnected() && !this.refusesChanges(todo)
  }

  /**
   * Whether nothing is being written and the list is not being downloaded.
   *
   * @returns true if neither
   */
  private isIdle(): boolean {
    return !this.writing.value && this.deps.parameters.list.value !== 'loading'
  }

  /**
   * Whether these changes include logging settings while the vehicle may be armed.
   *
   * @param todo the changes
   * @returns true if they are refused
   */
  private refusesChanges(todo: StagedChange[]): boolean {
    const setup = todo.some(change => change.guarded === true)

    return this.refusesLogging(todo.map(change => change.id)) || (setup && this.mayBeArmed())
  }

  /**
   * Whether logging settings are among `ids` while the vehicle is armed, or may be (its state is not known): they are never
   * queued or written then. This is the rule itself; the buttons only show it.
   *
   * @param ids the parameters
   * @returns true if they are refused
   */
  private refusesLogging(ids: readonly string[]): boolean {
    return includesGuarded(ids) && this.mayBeArmed()
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

  /**
   * Whether the writes go ahead after the question: the user said yes, the changes were not forgotten meanwhile, and the vehicle
   * did not arm (logging settings only).
   *
   * @param yes the user's answer
   * @param epoch the run the question was asked in
   * @param todo the changes
   * @returns true to write
   */
  private stillYes(yes: boolean, epoch: number, todo: StagedChange[]): boolean {
    return yes && epoch === this.epoch && !this.refusesChanges(todo)
  }

  async writeAll(): Promise<void> {
    const todo = this.pending()
    if (!this.startable(todo)) {
      return
    }
    const { epoch } = this
    // The lock is taken after the answer: the question is a modal dialog, and a button turned off behind it would lose the
    // focus that the dialog gives back.
    const yes = await this.deps.confirm(questionFor(this.withCurrentValues(todo)))
    // The vehicle may have armed while the question was open.
    if (this.stillYes(yes, epoch, todo)) {
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
    this.skipped = 0

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
    if (this.skipped > 0) {
      this.leftOut.value = { count: this.skipped }
    }
    if (this.readBack.value > 0 && this.readBack.value + this.skipped === count) {
      this.written.value = { count: this.readBack.value }
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
