// Parameter snapshots: saving the parameters as a file, loading one for review, and writing the changes the user ticks.
// Nothing is written without the user's ticks and one confirmation. It talks to the backend through the client
// (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from './backend/client'
import type { Connection, Param } from './generated/app'
import { type Change, type Review, parseSnapshot, review, saveSnapshot } from './snapshot'
import type { AppliedChange } from './state'
import type { WriteLock } from './writeLock'

/** What the snapshots need from the rest of the interface. */
export interface SnapshotsDeps {
  /** The link to the backend (its dialogs give and take the files, and it writes the parameters). */
  client: BackendClient
  /** Records why the last thing failed. */
  fail: (message: string | null) => void
  /** Asks the user to confirm `question`; the writes go ahead only on true. */
  confirm: (question: string) => Promise<boolean>
  /** The parameters the snapshot is compared with, and the one that is replaced after a write. */
  parameters: { params: ShallowRef<Param[]>, replace: (param: Param) => void, lock: WriteLock }
  /** The connection: the vehicle the snapshot is saved from, and whether writing is possible. */
  connection: ShallowRef<Connection>
}

/** The snapshots, as refs and actions. */
export interface SnapshotsModel {
  /** A loaded snapshot under review. */
  readonly importReview: ShallowRef<Review | null>
  /** Why the last snapshot could not be loaded. */
  readonly importError: ShallowRef<string | null>
  /** The changes the user ticked. */
  readonly picked: ShallowRef<string[]>
  /** Whether a snapshot is being applied. */
  readonly applying: ShallowRef<boolean>
  /** How each applied change went, in order. */
  readonly applied: ShallowRef<AppliedChange[]>
  /** The parameters as they were before applying a snapshot (a snapshot's JSON). */
  readonly backup: ShallowRef<string | null>
  /** The parameters as a snapshot (JSON), to save. */
  snapshot: () => string
  /** Saves `text` where the user chooses; resolves to where it went, or null if the user cancelled. */
  saveFile: (name: string, text: string) => Promise<string | null>
  /** Lets the user pick a snapshot file (the host's open dialog) and loads it for review. */
  openFile: () => Promise<void>
  /** Loads a snapshot for review: what it would change, with nothing picked yet. */
  load: (text: string) => void
  /** Ticks or unticks a change (ones that can't be applied can't be ticked). */
  toggle: (id: string) => void
  /** Closes the review of the snapshot. */
  close: () => void
  /** Writes the ticked changes, one at a time, after the user confirms the list. */
  apply: () => Promise<void>
}

/**
 * The question before a snapshot's ticked changes are written.
 *
 * @param changes the changes to write
 * @returns the question
 */
function applyQuestion(changes: Change[]): string {
  const names = changes.map(change => change.id).join(', ')

  return `Write ${changes.length} parameter${changes.length === 1 ? '' : 's'} to the vehicle (${names})?`
}

/** The snapshots. */
class Snapshots implements SnapshotsModel {
  readonly importReview = shallowRef<Review | null>(null)
  readonly importError = shallowRef<string | null>(null)
  readonly picked = shallowRef<string[]>([])
  readonly applying = shallowRef(false)
  readonly applied = shallowRef<AppliedChange[]>([])
  readonly backup = shallowRef<string | null>(null)

  /**
   * Makes the snapshots.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: SnapshotsDeps) {}

  snapshot(): string {
    return saveSnapshot(this.deps.parameters.params.value, this.deps.connection.value.vehicle)
  }

  async saveFile(name: string, text: string): Promise<string | null> {
    try {
      const { path } = await this.deps.client.call('files.save', { name, text })

      return path ?? null
    } catch (error) {
      this.deps.fail(`Couldn't save: ${describeError(error)}`)

      return null
    }
  }

  async openFile(): Promise<void> {
    try {
      const { text } = await this.deps.client.call('files.open', null)
      if (text !== undefined) {
        this.load(text)
      }
    } catch (error) {
      this.importError.value = `Couldn't open it: ${describeError(error)}`
    }
  }

  /** Forgets the review's ticks and results. */
  private clearPicks(): void {
    this.picked.value = []
    this.applied.value = []
  }

  load(text: string): void {
    const snapshot = parseSnapshot(text)
    this.clearPicks()

    if (typeof snapshot === 'string') {
      this.importReview.value = null
      this.importError.value = `Can't load it: ${snapshot}.`

      return
    }
    this.importReview.value = review(snapshot, this.deps.parameters.params.value, this.deps.connection.value.vehicle)
    this.importError.value = null
  }

  /**
   * Whether a change of the snapshot under review can be ticked: it can be applied, and nothing is being written.
   *
   * @param id the parameter's id
   * @returns true if it can be ticked
   */
  private pickable(id: string): boolean {
    const change = this.importReview.value?.changes.find(candidate => candidate.id === id)

    return change !== undefined && change.problem === null && !this.applying.value
  }

  toggle(id: string): void {
    if (!this.pickable(id)) {
      return
    }
    const picked = this.picked.value
    this.picked.value = picked.includes(id) ? picked.filter(other => other !== id) : [...picked, id]
  }

  close(): void {
    this.importReview.value = null
    this.importError.value = null
    this.clearPicks()
  }

  /**
   * The changes the user ticked and that can be applied.
   *
   * @returns the changes, in the snapshot's order
   */
  private pickedChanges(): Change[] {
    const picked = this.picked.value

    return this.importReview.value?.changes.filter(change => picked.includes(change.id) && change.problem === null) ?? []
  }

  /**
   * Writes one change of a snapshot, and says how it went.
   *
   * @param change the change
   * @returns how it went
   */
  private async applyOne(change: Change): Promise<AppliedChange> {
    const param = this.deps.parameters.params.value.find(candidate => candidate.id === change.id)
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
      return { id: param.id, outcome: 'failed', detail: describeError(error) }
    }
  }

  /**
   * Writes the changes one after the other, until one is not verified.
   *
   * @param changes the changes still to write
   */
  private async applyFrom(changes: Change[]): Promise<void> {
    const [change, ...rest] = changes
    if (!change) {
      return
    }
    const line = await this.applyOne(change)
    this.applied.value = [...this.applied.value, line]

    if (line.outcome === 'verified') {
      await this.applyFrom(rest)
    }
  }

  /**
   * Whether the ticked changes can be written now: there are some, a vehicle is connected, and nothing is being written.
   *
   * @param changes the ticked changes
   * @returns true if they can
   */
  private applicable(changes: Change[]): boolean {
    return changes.length > 0 && this.deps.connection.value.state === 'connected' && !this.applying.value
  }

  async apply(): Promise<void> {
    const changes = this.pickedChanges()
    // The lock is taken after the answer: the question is a modal dialog, and a button turned off behind it would lose the
    // focus that the dialog gives back.
    if (!this.applicable(changes) || !await this.deps.confirm(applyQuestion(changes))) {
      return
    }
    const release = this.deps.parameters.lock.take()
    if (!release) {
      return
    }
    try {
      await this.applyConfirmed(changes)
    } finally {
      release()
    }
  }

  /**
   * Writes the changes the user said yes to, after taking the backup.
   *
   * @param changes the ticked changes
   */
  private async applyConfirmed(changes: Change[]): Promise<void> {
    this.applying.value = true
    this.applied.value = []
    this.backup.value = this.snapshot()

    try {
      await this.applyFrom(changes)
    } finally {
      this.applying.value = false
    }
  }
}

/**
 * Makes the snapshots.
 *
 * @param deps the client and the rest of the interface
 * @returns the refs and the actions
 */
export function useSnapshots(deps: SnapshotsDeps): SnapshotsModel {
  return new Snapshots(deps)
}
