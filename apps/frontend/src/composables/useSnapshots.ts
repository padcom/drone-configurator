// Parameter snapshots and parameter files: saving the parameters as a snapshot (JSON) or as one of ArduPilot's plain-text
// parameter files (`.param`, `.parm`, `.params`), loading either for review, and writing the changes the user ticks. Nothing
// is written without the user's ticks and one confirmation, nothing while the vehicle is armed or may be (as a Setup write),
// and every write is read back. It talks to the backend through the client (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import { say } from '@/i18n/say'
import type { Connection, Param } from '@/generated/app'
import { notConfirmedText, showNumber } from '@/lib/params/paramValue'
import { type Change, type Review, parseSnapshot, review, saveSnapshot } from '@/lib/params/snapshot'
import type { Metadata } from '@/lib/params/metadata'
import { type ParamFileFormat, formatParamFile, looksLikeJson, parseParamFile } from '@/lib/params/paramFile'
import { reviewFile } from '@/lib/params/paramFileReview'
import type { AppliedChange } from '@/state/state'
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
  /** Whether the vehicle is armed or may be (unknown counts as armed): nothing is written then. */
  mayBeArmed?: () => boolean
  /** The parameter metadata, when loaded: its read-only parameters are not written, and its ranges give warnings. */
  metadata?: () => Metadata
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
  /** The parameters as a plain-text parameter file in `format`, to save. */
  paramFile: (format: ParamFileFormat) => string
  /** Whether the vehicle is armed or may be: the ticked changes are not written then. */
  mayBeArmed: () => boolean
  /** Saves `text` where the user chooses; resolves to where it went, or null if the user cancelled. */
  saveFile: (name: string, text: string) => Promise<string | null>
  /** Lets the user pick a snapshot or parameter file (the host's open dialog) and loads it for review. */
  openFile: () => Promise<void>
  /** Loads a snapshot (JSON) or a parameter file (plain text) for review: what it would change, with nothing picked yet. */
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

  return say('question.snapshot', { count: changes.length, names }, changes.length)
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

  paramFile(format: ParamFileFormat): string {
    return formatParamFile(this.deps.parameters.params.value, format, { vehicle: this.deps.connection.value.vehicle })
  }

  async saveFile(name: string, text: string): Promise<string | null> {
    try {
      const { path } = await this.deps.client.call('files.save', { name, text })

      return path ?? null
    } catch (error) {
      this.deps.fail(say('notice.snapshotSave', { error: describeError(error) }))

      return null
    }
  }

  async openFile(): Promise<void> {
    try {
      const { text } = await this.deps.client.call('files.openParams', null)
      if (text !== undefined) {
        this.load(text)
      }
    } catch (error) {
      this.importError.value = say('notice.open', { error: describeError(error) })
    }
  }

  /** Forgets the review's ticks and results. */
  private clearPicks(): void {
    this.picked.value = []
    this.applied.value = []
  }

  load(text: string): void {
    const reviewed = looksLikeJson(text) ? this.reviewSnapshot(text) : this.reviewParamFile(text)
    this.clearPicks()

    if (typeof reviewed === 'string') {
      this.importReview.value = null
      this.importError.value = say('notice.snapshotLoad', { reason: reviewed })

      return
    }
    this.importReview.value = reviewed
    this.importError.value = null
  }

  /**
   * What a snapshot would change.
   *
   * @param text the snapshot's JSON
   * @returns the review, or why it is not a snapshot
   */
  private reviewSnapshot(text: string): Review | string {
    const snapshot = parseSnapshot(text)
    const { params, vehicle, options } = this.against()

    return typeof snapshot === 'string' ? snapshot : review(snapshot, params, vehicle, options)
  }

  /**
   * What a plain-text parameter file would change.
   *
   * @param text the file's text
   * @returns the review, or why it is not a parameter file (it has no parameter lines)
   */
  private reviewParamFile(text: string): Review | string {
    const file = parseParamFile(text)
    const { params, vehicle, options } = this.against()

    return file.entries.length === 0 ? say('reason.noParamLines') : reviewFile(file, params, vehicle, options)
  }

  /**
   * What a review compares with: the vehicle's parameters, the vehicle, and the metadata.
   *
   * @returns them
   */
  private against() {
    const metadata = this.deps.metadata?.()

    return {
      params: this.deps.parameters.params.value,
      vehicle: this.deps.connection.value.vehicle,
      options: metadata ? { metadata } : {},
    }
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
  private applyOne(change: Change): Promise<AppliedChange> {
    const param = this.deps.parameters.params.value.find(candidate => candidate.id === change.id)
    if (!param) {
      return Promise.resolve({ id: change.id, outcome: 'failed', detail: say('problem.notOnVehicle') })
    }

    return this.write(param, change)
  }

  mayBeArmed(): boolean {
    return this.deps.mayBeArmed?.() ?? false
  }

  /**
   * Writes one change to the vehicle, and says how it went.
   *
   * @param param the parameter
   * @param change the change
   * @returns how it went
   */
  private async write(param: Param, change: Change): Promise<AppliedChange> {
    try {
      const { id, kind, type } = param
      // Guarded, as a Setup write: the backend refuses it too while the vehicle is armed or not known to be disarmed.
      const result = await this.deps.client.call('params.write', { id, kind, type, value: change.to, guarded: true })
      this.deps.parameters.replace(result.param)

      return result.verified
        ? { id, outcome: 'verified', detail: showNumber(result.param.value) }
        : { id, outcome: 'changed', detail: notConfirmedText(result.param.value, change.to) }
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
   * Whether the ticked changes can be written now: there are some, a vehicle is connected and known to be disarmed, and
   * nothing is being written.
   *
   * @param changes the ticked changes
   * @returns true if they can
   */
  private applicable(changes: Change[]): boolean {
    return changes.length > 0 && this.deps.connection.value.state === 'connected' && !this.applying.value && !this.mayBeArmed()
  }

  async apply(): Promise<void> {
    const changes = this.pickedChanges()
    // The lock is taken after the answer: the question is a modal dialog, and a button turned off behind it would lose the
    // focus that the dialog gives back.
    if (!this.applicable(changes) || !await this.deps.confirm(applyQuestion(changes))) {
      return
    }
    const release = this.takeLock()
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
   * Takes the write lock, unless the vehicle may have armed while the question was up: then nothing is written (the status line
   * says why).
   *
   * @returns what releases the lock, or null when nothing is to be written
   */
  private takeLock(): (() => void) | null {
    return this.mayBeArmed() ? null : this.deps.parameters.lock.take()
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
