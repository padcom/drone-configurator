// The dashboard's state and actions, without the DOM, so every interaction is testable with the mock backend. The vehicle
// link and the parameters are composables (useVehicle, useParams); what is left here is the metadata, the files, and
// the snapshots with their import, and the one State that the components read.
import { type BackendClient, type Transport, createBackendClient, describeError } from './backend/client'
import type { Connection, Param, SerialPort, Telemetry } from './generated/app'
import { type Metadata, checkMeta, parseMetadata } from './metadata'
import { type Change, type Review, parseSnapshot, review, saveSnapshot } from './snapshot'
import { validateDraft } from './draft'
import { type ListState, type ParamsModel, type WriteStatus, useParams } from './useParams'
import { type Vehicle, useVehicle } from './useVehicle'

export { validateDraft } from './draft'

export type { WriteStatus } from './useParams'

/** Everything the components show. */
export interface State {
  /** The connection's state, and the vehicle found. */
  connection: Connection
  /** Every parameter, as downloaded. */
  params: Param[]
  /** `loading`, or how the last download ended. */
  list: ListState
  /** The indexes that never arrived. */
  missing: number[]
  /** What the user typed to narrow the list. */
  filter: string
  /** The selected parameter's id. */
  selected: string | null
  /** The new value as typed. */
  draft: string
  /** Why the draft is not a valid value. */
  draftError: string | null
  /** Whether a write is under way. */
  writing: boolean
  /** How the last write went. */
  lastWrite: WriteStatus | null
  /** The latest telemetry. */
  telemetry: Telemetry | null
  /** Why the last thing failed. */
  error: string | null
  /** Why the vehicle session ended without the user asking (a backend restart). */
  notice: string | null
  /** A loaded snapshot under review. */
  importReview: Review | null
  /** Why the last snapshot could not be loaded. */
  importError: string | null
  /** The changes the user ticked (nothing is ticked at first: no unattended bulk writes). */
  picked: string[]
  /** Whether a snapshot is being applied. */
  applying: boolean
  /** How each applied change went, in order; applying stops at the first that didn't verify. */
  applied: { id: string, outcome: 'verified' | 'changed' | 'failed', detail: string }[]
  /** The parameters as they were before applying a snapshot (a snapshot's JSON). */
  backup: string | null
  /** The backend machine's serial ports, as last listed. */
  ports: SerialPort[]
  /** Loaded parameter metadata (empty: none). */
  metadata: Metadata
  /** Why the last metadata file wasn't loaded. */
  metadataError: string | null
}

/** How the Configurator reaches the user. */
export interface Ui {
  /** Shows the state: called after every change. */
  render: (state: State) => void
  /** Asks the user to confirm `question`; the write goes ahead only on true. */
  confirm: (question: string) => Promise<boolean>
}

/** The parts of the state that are held here, not by the vehicle link or the parameters. */
type Own = Pick<
  State,
  'error' | 'importReview' | 'importError' | 'picked' | 'applying' | 'applied' | 'backup' | 'metadata' | 'metadataError'
>

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

/** The dashboard's state and actions. */
export class Configurator {
  /** The vehicle link: connection, ports, notice and telemetry. */
  readonly vehicle: Vehicle
  /** The parameters: the list, the selection, the draft and the writing. */
  readonly parameters: ParamsModel
  private readonly client: BackendClient
  private own: Own = {
    error: null,
    importReview: null,
    importError: null,
    picked: [],
    applying: false,
    applied: [],
    backup: null,
    metadata: new Map(),
    metadataError: null,
  }

  /**
   * Starts listening to the backend.
   *
   * @param transport the host's bridge, or the mock backend
   * @param ui how the Configurator reaches the user
   */
  constructor(transport: Transport, private readonly ui: Ui) {
    this.client = createBackendClient(transport)
    const shared = {
      client: this.client,
      fail: (message: string | null) => {
        this.own = { ...this.own, error: message }
      },
      changed: () => this.ui.render(this.state),
    }
    this.parameters = useParams({
      ...shared,
      isConnected: () => this.vehicle.connection.value.state === 'connected',
      confirm: question => this.ui.confirm(question),
      problemWith: (param, text) => this.problemWith(param, text),
    })
    this.vehicle = useVehicle({
      ...shared,
      onConnected: () => void this.parameters.refresh(),
      onNotConnected: () => this.parameters.stopWriting(),
    })
    this.client.onState(state => this.vehicle.backendChanged(state))
    this.client.onEvent('params.changed', param => this.parameters.announced(param))
    void this.vehicle.watch()
  }

  /**
   * Everything the components show, as it is now.
   *
   * @returns a new State object each time
   */
  get state(): State {
    const { vehicle, parameters } = this

    return {
      ...this.own,
      connection: vehicle.connection.value,
      params: parameters.params.value,
      list: parameters.list.value,
      missing: parameters.missing.value,
      filter: parameters.filter.value,
      selected: parameters.selected.value,
      draft: parameters.draft.value,
      draftError: parameters.draftError.value,
      writing: parameters.writing.value,
      lastWrite: parameters.lastWrite.value,
      telemetry: vehicle.telemetry.value,
      notice: vehicle.notice.value,
      ports: vehicle.ports.value,
    }
  }

  /**
   * Sets all of the state at once (tests do this to play the backend's part).
   *
   * @param next the new state
   */
  set state(next: State) {
    const { vehicle, parameters } = this
    this.own = {
      error: next.error,
      importReview: next.importReview,
      importError: next.importError,
      picked: next.picked,
      applying: next.applying,
      applied: next.applied,
      backup: next.backup,
      metadata: next.metadata,
      metadataError: next.metadataError,
    }
    vehicle.connection.value = next.connection
    vehicle.telemetry.value = next.telemetry
    vehicle.notice.value = next.notice
    vehicle.ports.value = next.ports
    parameters.params.value = next.params
    parameters.list.value = next.list
    parameters.missing.value = next.missing
    parameters.filter.value = next.filter
    parameters.selected.value = next.selected
    parameters.draft.value = next.draft
    parameters.draftError.value = next.draftError
    parameters.writing.value = next.writing
    parameters.lastWrite.value = next.lastWrite
  }

  /**
   * Changes what is held here, and shows it.
   *
   * @param change the fields to change
   */
  private set(change: Partial<Own>): void {
    this.own = { ...this.own, ...change }
    this.ui.render(this.state)
  }

  /**
   * The parameters matching the filter (case-insensitive, anywhere in the name).
   *
   * @returns the matching parameters
   */
  visible(): Param[] {
    return this.parameters.visible()
  }

  /**
   * The selected parameter.
   *
   * @returns the parameter, or null
   */
  selectedParam(): Param | null {
    return this.parameters.selectedParam()
  }

  /**
   * Connects to what the request says.
   *
   * @param request how to reach the vehicle
   */
  async connect(request: Parameters<Vehicle['connect']>[0]): Promise<void> {
    await this.vehicle.connect(request)
  }

  /** Disconnects from the vehicle. */
  async disconnect(): Promise<void> {
    await this.vehicle.disconnect()
  }

  /** Downloads the parameters again. */
  async refresh(): Promise<void> {
    await this.parameters.refresh()
  }

  /**
   * Narrows the list of parameters.
   *
   * @param filter what the user typed
   */
  setFilter(filter: string): void {
    this.parameters.setFilter(filter)
  }

  /**
   * Selects a parameter.
   *
   * @param id its id
   */
  select(id: string): void {
    this.parameters.select(id)
  }

  /**
   * Why `text` isn't a valid value for `param`: its type, then its metadata (if any).
   *
   * @param param the parameter
   * @param text what the user typed
   * @returns the problem, or null
   */
  problemWith(param: Param, text: string): string | null {
    return validateDraft(param, text) ?? checkMeta(this.own.metadata.get(param.id), Number(text.trim()))
  }

  /**
   * The user typed a new value.
   *
   * @param draft what they typed
   */
  editDraft(draft: string): void {
    this.parameters.editDraft(draft)
  }

  /** Writes the draft after the user confirms; the vehicle's read-back decides the outcome. */
  async write(): Promise<void> {
    await this.parameters.write()
  }

  /** Lists the serial ports (for the serial transport's device choice). */
  async listPorts(): Promise<void> {
    await this.vehicle.listPorts()
  }

  /** Lets the user pick a metadata file (the host's open dialog) and loads it. */
  async openMetadataFile(): Promise<void> {
    try {
      const { text } = await this.client.call('files.open', null)
      if (text !== undefined) {
        this.loadMetadata(text)
      }
    } catch (error) {
      this.set({ metadataError: `Couldn't open it: ${describeError(error)}` })
    }
  }

  /**
   * Loads parameter metadata (replacing what was loaded).
   *
   * @param text the metadata file's text
   */
  loadMetadata(text: string): void {
    const loaded = parseMetadata(text)
    if (typeof loaded === 'string') {
      this.set({ metadataError: `Can't load the metadata: ${loaded}.` })
    } else {
      this.set({ metadata: loaded, metadataError: null })
    }
  }

  /**
   * The parameters as a snapshot (JSON), to save.
   *
   * @returns the snapshot's text
   */
  snapshot(): string {
    return saveSnapshot(this.parameters.params.value, this.vehicle.connection.value.vehicle)
  }

  /**
   * Saves `text` where the user chooses, through the backend (the host's save dialog).
   *
   * @param name the suggested file name
   * @param text what to save
   * @returns where it went, or null if the user cancelled
   */
  async saveFile(name: string, text: string): Promise<string | null> {
    try {
      const { path } = await this.client.call('files.save', { name, text })

      return path ?? null
    } catch (error) {
      this.set({ error: `Couldn't save: ${describeError(error)}` })

      return null
    }
  }

  /** Lets the user pick a snapshot file (the host's open dialog) and loads it for review. */
  async openSnapshotFile(): Promise<void> {
    try {
      const { text } = await this.client.call('files.open', null)
      if (text !== undefined) {
        this.loadSnapshot(text)
      }
    } catch (error) {
      this.set({ importError: `Couldn't open it: ${describeError(error)}` })
    }
  }

  /**
   * Loads a snapshot for review: what it would change, with nothing picked yet.
   *
   * @param text the snapshot file's text
   */
  loadSnapshot(text: string): void {
    const snapshot = parseSnapshot(text)
    if (typeof snapshot === 'string') {
      this.set({ importReview: null, importError: `Can't load it: ${snapshot}.`, picked: [], applied: [] })

      return
    }
    const reviewed = review(snapshot, this.parameters.params.value, this.vehicle.connection.value.vehicle)
    this.set({ importReview: reviewed, importError: null, picked: [], applied: [] })
  }

  /**
   * Whether a change of the snapshot under review can be ticked: it can be applied, and nothing is being written.
   *
   * @param id the parameter's id
   * @returns true if it can be ticked
   */
  private pickable(id: string): boolean {
    const change = this.own.importReview?.changes.find(candidate => candidate.id === id)

    return change !== undefined && change.problem === null && !this.own.applying
  }

  /**
   * Ticks or unticks a change (ones that can't be applied can't be ticked).
   *
   * @param id the parameter's id
   */
  togglePick(id: string): void {
    if (!this.pickable(id)) {
      return
    }
    const { picked } = this.own
    this.set({ picked: picked.includes(id) ? picked.filter(other => other !== id) : [...picked, id] })
  }

  /** Closes the review of the snapshot. */
  closeImport(): void {
    this.set({ importReview: null, importError: null, picked: [], applied: [] })
  }

  /**
   * The changes the user ticked and that can be applied.
   *
   * @returns the changes, in the snapshot's order
   */
  private pickedChanges(): Change[] {
    const { importReview, picked } = this.own

    return importReview?.changes.filter(change => picked.includes(change.id) && change.problem === null) ?? []
  }

  /**
   * Writes one change of a snapshot, and says how it went.
   *
   * @param change the change
   * @returns how it went
   */
  private async applyOne(change: Change): Promise<State['applied'][number]> {
    const param = this.parameters.params.value.find(candidate => candidate.id === change.id)
    if (!param) {
      return { id: change.id, outcome: 'failed', detail: 'not on this vehicle' }
    }
    try {
      const { id, kind, type } = param
      const result = await this.client.call('params.write', { id, kind, type, value: change.to })
      this.parameters.replace(result.param)

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
    this.set({ applied: [...this.own.applied, line] })

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
    return changes.length > 0 && this.vehicle.connection.value.state === 'connected' && !this.own.applying
  }

  /**
   * Writes the ticked changes, one at a time, after the user confirms the list. The values before
   * are kept as a backup. Applying stops at the first change that isn't verified.
   */
  async applyImport(): Promise<void> {
    const changes = this.pickedChanges()
    if (!this.applicable(changes) || !await this.ui.confirm(applyQuestion(changes))) {
      return
    }
    this.set({ applying: true, applied: [], backup: this.snapshot() })
    await this.applyFrom(changes)
    this.set({ applying: false })
  }
}
