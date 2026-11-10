// Parameter changes collected to be written together: "Add to changes" stages the selected parameter's draft, and "Write N
// and verify" sends them one after the other, each read back, stopping at the first the vehicle does not confirm. A change is
// only done when the vehicle reports the new value; nothing is written until the user asks, after one question for all.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from './backend/client'
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
  /** How each change that was written went, in order. */
  readonly results: ShallowRef<StagedResult[]>
  /** Whether the writes are under way. */
  readonly writing: ShallowRef<boolean>
  /** Adds the selected parameter's draft to the changes (a valid one that differs from the vehicle's value). */
  stage: () => void
  /** Takes a change that has not been written out of the list. */
  discard: (id: string) => void
  /** Forgets every change and result (the session ended, or another vehicle was connected). */
  reset: () => void
  /** Writes the changes that are not written yet, after one question, and stops at the first that is not confirmed. */
  writeAll: () => Promise<void>
  /** The changes that have not been written. */
  pending: () => StagedChange[]
  /** Whether the draft of the selected parameter can be added now. */
  canStage: () => boolean
}

/**
 * What the user is asked before the changes are written.
 *
 * @param changes the changes to write
 * @returns the question, with every name in it
 */
export function questionFor(changes: StagedChange[]): string {
  const noun = changes.length === 1 ? 'parameter' : 'parameters'

  return `Write ${changes.length} ${noun} to the vehicle (${changes.map(change => change.id).join(', ')})?`
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
  readonly writing = shallowRef(false)

  /**
   * Makes the staged changes.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: StagedDeps) {}

  /**
   * The names of the changes the vehicle has read back.
   *
   * @returns the names
   */
  private writtenIds(): Set<string> {
    return new Set(this.results.value.filter(result => result.outcome === 'verified').map(result => result.id))
  }

  pending(): StagedChange[] {
    const written = this.writtenIds()

    return this.changes.value.filter(change => !written.has(change.id))
  }

  /**
   * The value to add to the changes: the draft of the selected parameter, if it is a valid one that differs from the vehicle's.
   *
   * @returns the value, or null
   */
  private draftValue(): number | null {
    const { parameters } = this.deps
    const param = parameters.selectedParam()
    const text = parameters.draft.value.trim()
    const value = Number(text)
    const usable = [param !== null, text !== '', parameters.draftError.value === null].every(Boolean)

    return usable && value !== param?.value ? value : null
  }

  canStage(): boolean {
    return !this.writing.value && this.draftValue() !== null
  }

  stage(): void {
    const param = this.deps.parameters.selectedParam()
    const to = this.draftValue()
    if (!param || to === null || this.writing.value) {
      return
    }
    // What was written stays on screen until the next change is added; then it is cleared away.
    const written = this.writtenIds()
    const kept = this.changes.value.filter(change => !written.has(change.id) && change.id !== param.id)
    this.changes.value = [...kept, { id: param.id, from: param.value, to }]
    // The words about the rows that stay (why one was not confirmed) stay with them; the rest go.
    this.results.value = this.results.value.filter(result => kept.some(change => change.id === result.id))
  }

  reset(): void {
    this.changes.value = []
    this.results.value = []
  }

  discard(id: string): void {
    if (this.writing.value) {
      return
    }
    this.changes.value = this.changes.value.filter(change => change.id !== id)
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
   */
  private async writeFrom(changes: StagedChange[]): Promise<void> {
    const [change, ...rest] = changes
    if (!change) {
      return
    }
    const result = await this.writeOne(change)
    this.results.value = [...this.results.value, result]

    if (result.outcome === 'verified') {
      await this.writeFrom(rest)
    }
  }

  /**
   * Whether the writes can start now: there are changes, a vehicle is connected, and nothing is being written.
   *
   * @param todo the changes not written yet
   * @returns true if they can
   */
  private startable(todo: StagedChange[]): boolean {
    return todo.length > 0 && !this.writing.value && this.deps.isConnected()
  }

  async writeAll(): Promise<void> {
    const todo = this.pending()
    const release = this.startable(todo) ? this.deps.parameters.lock.take() : null
    if (!release) {
      return
    }
    try {
      if (await this.deps.confirm(questionFor(todo))) {
        await this.writeConfirmed(todo)
      }
    } finally {
      release()
    }
  }

  /**
   * Writes the changes the user said yes to. What the vehicle already read back stays read back; the rest is tried again.
   *
   * @param todo the changes not written yet
   */
  private async writeConfirmed(todo: StagedChange[]): Promise<void> {
    this.writing.value = true
    this.results.value = this.results.value.filter(result => result.outcome === 'verified')

    try {
      await this.writeFrom(todo)
    } finally {
      this.writing.value = false
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
