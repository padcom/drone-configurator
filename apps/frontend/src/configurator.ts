// The dashboard's state and actions, without the DOM (render.ts draws it), so every interaction is
// testable with the mock backend.
import { Communicator, CommunicatorError, type Transport } from '@pico-desktop/communicator'
import { type Connection, type ConnectRequest, type Param, type Services, type Telemetry, validate } from './generated/app'
import { type Review, parseSnapshot, review, saveSnapshot } from './snapshot'

/** How the last write went. */
export type WriteStatus
  = | { kind: 'verified', id: string, value: number }
    | { kind: 'changed', id: string, asked: number, reported: number }
    | { kind: 'failed', id: string, message: string }

export interface State {
  connection: Connection
  params: Param[]
  /** `loading`, or how the last download ended. */
  list: 'none' | 'loading' | 'complete' | 'incomplete' | 'failed'
  missing: number[]
  filter: string
  selected: string | null
  draft: string
  draftError: string | null
  writing: boolean
  lastWrite: WriteStatus | null
  telemetry: Telemetry | null
  error: string | null
  /** Why the vehicle session ended without the user asking (a backend restart). */
  notice: string | null
  /** A loaded snapshot under review, and why the last one couldn't be loaded. */
  importReview: Review | null
  importError: string | null
  /** The changes the user ticked (nothing is ticked at first: no unattended bulk writes). */
  picked: string[]
  applying: boolean
  /** How each applied change went, in order; applying stops at the first that didn't verify. */
  applied: { id: string, outcome: 'verified' | 'changed' | 'failed', detail: string }[]
  /** The parameters as they were before applying a snapshot (a snapshot's JSON). */
  backup: string | null
}

export interface Ui {
  render(state: State): void
  /** Asks the user to confirm `question`; the write goes ahead only on true. */
  confirm(question: string): Promise<boolean>
}

const RANGES: Record<string, [number, number]> = {
  UINT8: [0, 255],
  INT8: [-128, 127],
  UINT16: [0, 65535],
  INT16: [-32768, 32767],
  UINT32: [0, 4294967295],
  INT32: [-2147483648, 2147483647],
}

/**
 * Why `text` isn't a valid new value for `param`, or null if it is.
 *
 * @param param the parameter being edited
 * @param text what the user typed
 * @returns the problem, or null
 */
export function validateDraft(param: Param, text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '' || !Number.isFinite(Number(trimmed))) {
    return 'a number, please'
  }
  const n = Number(trimmed)
  if (param.kind === 'int') {
    if (!Number.isInteger(n)) {
      return `${param.id} is an integer (${param.type})`
    }
    const range = RANGES[param.type]
    if (range && (n < range[0] || n > range[1])) {
      return `${param.type} goes from ${range[0]} to ${range[1]}`
    }
  } else if (param.type === 'REAL32' && Math.abs(n) > 3.4e38) {
    return 'too large for a REAL32'
  }

  return null
}

const describeError = (error: unknown) => error instanceof CommunicatorError ? `${error.code}: ${error.message}` : String(error)

export class Configurator {
  readonly communicator: Communicator<Services>
  state: State = {
    connection: { state: 'disconnected' },
    params: [],
    list: 'none',
    missing: [],
    filter: '',
    selected: null,
    draft: '',
    draftError: null,
    writing: false,
    lastWrite: null,
    telemetry: null,
    error: null,
    notice: null,
    importReview: null,
    importError: null,
    picked: [],
    applying: false,
    applied: [],
    backup: null,
  }

  constructor(transport: Transport, private readonly ui: Ui) {
    this.communicator = new Communicator<Services>({ transport, validate })
    this.communicator.onConnectionChange(state => this.backendChanged(state))
    void this.watch()
  }

  /**
   * The backend went away (it restarts after a crash or an edit in development): the vehicle
   * session is gone with it. The parameters stay visible, nothing pending is sent again, and the
   * user reconnects when they choose.
   */
  private backendChanged(state: string) {
    const session = this.state.connection.state
    if (state !== 'ready' && (session === 'connected' || session === 'connecting')) {
      this.set({
        connection: { state: 'lost', vehicle: this.state.connection.vehicle },
        telemetry: null,
        notice: `The backend ${state === 'restarting' ? 'restarted' : 'stopped'}: the vehicle session ended. Connect again to continue.`,
      })
    }
  }

  private set(change: Partial<State>) {
    this.state = { ...this.state, ...change }
    this.ui.render(this.state)
  }

  private async watch() {
    try {
      await this.communicator.subscribe('vehicle.connection', null, connection => this.connectionChanged(connection))
      await this.communicator.subscribe('telemetry.stream', null, telemetry => this.set({ telemetry }))
    } catch (error) {
      this.set({ error: `the backend: ${describeError(error)}` })
    }
  }

  private connectionChanged(connection: Connection) {
    const was = this.state.connection.state
    this.set({ connection, error: connection.error ?? null })
    if (connection.state === 'connected' && was !== 'connected') {
      void this.refresh()
    }
    if (connection.state !== 'connected') {
      // What's shown may no longer be the vehicle's: keep it visible, but don't offer edits.
      this.set({ telemetry: null, writing: false })
    }
  }

  /** The parameters matching the filter (case-insensitive, anywhere in the name). */
  visible(): Param[] {
    const f = this.state.filter.trim().toUpperCase()

    return f === '' ? this.state.params : this.state.params.filter(p => p.id.includes(f))
  }

  selectedParam(): Param | null {
    return this.state.params.find(p => p.id === this.state.selected) ?? null
  }

  async connect(request: ConnectRequest) {
    this.set({ connection: { state: 'connecting' }, error: null, notice: null })
    try {
      const connection = await this.communicator.request('vehicle.connect', request)
      this.connectionChanged(connection)
    } catch (error) {
      this.set({ connection: { state: 'disconnected' }, error: describeError(error) })
    }
  }

  async disconnect() {
    try {
      this.connectionChanged(await this.communicator.request('vehicle.disconnect', null))
    } catch (error) {
      this.set({ error: describeError(error) })
    }
  }

  async refresh() {
    this.set({ list: 'loading' })
    try {
      const list = await this.communicator.request('params.list', null)
      this.set({ params: list.params, missing: list.missing, list: list.complete ? 'complete' : 'incomplete' })
    } catch (error) {
      this.set({ list: 'failed', error: describeError(error) })
    }
  }

  setFilter(filter: string) {
    this.set({ filter })
  }

  select(id: string) {
    const param = this.state.params.find(p => p.id === id)
    this.set({ selected: param ? id : null, draft: param ? String(param.value) : '', draftError: null })
  }

  editDraft(draft: string) {
    const param = this.selectedParam()
    this.set({ draft, draftError: param ? validateDraft(param, draft) : null })
  }

  /** The parameters as a snapshot (JSON), to save. */
  snapshot(): string {
    return saveSnapshot(this.state.params, this.state.connection.vehicle)
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
      const { path } = await this.communicator.request('files.save', { name, text })

      return path ?? null
    } catch (error) {
      this.set({ error: `Couldn't save: ${describeError(error)}` })

      return null
    }
  }

  /** Lets the user pick a snapshot file (the host's open dialog) and loads it for review. */
  async openSnapshotFile() {
    try {
      const { text } = await this.communicator.request('files.open', null)
      if (text !== undefined) {
        this.loadSnapshot(text)
      }
    } catch (error) {
      this.set({ importError: `Couldn't open it: ${describeError(error)}` })
    }
  }

  /** Loads a snapshot for review: what it would change, with nothing picked yet. */
  loadSnapshot(text: string) {
    const s = parseSnapshot(text)
    if (typeof s === 'string') {
      this.set({ importReview: null, importError: `Can't load it: ${s}.`, picked: [], applied: [] })
    } else {
      this.set({ importReview: review(s, this.state.params, this.state.connection.vehicle), importError: null, picked: [], applied: [] })
    }
  }

  /** Ticks or unticks a change (ones that can't be applied can't be ticked). */
  togglePick(id: string) {
    const change = this.state.importReview?.changes.find(c => c.id === id)
    if (!change || change.problem !== null || this.state.applying) {
      return
    }
    const picked = this.state.picked.includes(id) ? this.state.picked.filter(p => p !== id) : [...this.state.picked, id]
    this.set({ picked })
  }

  closeImport() {
    this.set({ importReview: null, importError: null, picked: [], applied: [] })
  }

  /**
   * Writes the ticked changes, one at a time, after the user confirms the list. The values before
   * are kept as a backup. Applying stops at the first change that isn't verified.
   */
  async applyImport() {
    const r = this.state.importReview
    const picked = r?.changes.filter(c => this.state.picked.includes(c.id) && c.problem === null) ?? []
    if (picked.length === 0 || this.state.connection.state !== 'connected' || this.state.applying) {
      return
    }
    const names = picked.map(c => c.id).join(', ')
    if (!await this.ui.confirm(`Write ${picked.length} parameter${picked.length === 1 ? '' : 's'} to the vehicle (${names})?`)) {
      return
    }
    this.set({ applying: true, applied: [], backup: this.snapshot() })
    const applied: State['applied'] = []
    for (const change of picked) {
      const param = this.state.params.find(p => p.id === change.id)!
      try {
        const result = await this.communicator.request('params.write', { id: param.id, kind: param.kind, type: param.type, value: change.to })
        this.set({ params: this.state.params.map(p => p.id === result.param.id ? result.param : p) })
        applied.push(result.verified
          ? { id: param.id, outcome: 'verified', detail: `${result.param.value}` }
          : { id: param.id, outcome: 'changed', detail: `the vehicle reports ${result.param.value}, not ${change.to}` })
      } catch (error) {
        applied.push({ id: param.id, outcome: 'failed', detail: describeError(error) })
      }
      this.set({ applied: [...applied] })
      if (applied.at(-1)?.outcome !== 'verified') {
        break
      }
    }
    this.set({ applying: false })
  }

  /** Writes the draft after the user confirms; the vehicle's read-back decides the outcome. */
  async write() {
    const param = this.selectedParam()
    if (!param || this.state.connection.state !== 'connected' || this.state.writing) {
      return
    }
    const problem = validateDraft(param, this.state.draft)
    if (problem) {
      this.set({ draftError: problem })

      return
    }
    const value = Number(this.state.draft.trim())
    if (!await this.ui.confirm(`Set ${param.id} from ${param.value} to ${value}?`)) {
      return
    }
    this.set({ writing: true, lastWrite: null })
    try {
      const result = await this.communicator.request('params.write', { id: param.id, kind: param.kind, type: param.type, value })
      const params = this.state.params.map(p => p.id === result.param.id ? result.param : p)
      const lastWrite: WriteStatus = result.verified
        ? { kind: 'verified', id: param.id, value: result.param.value }
        : { kind: 'changed', id: param.id, asked: value, reported: result.param.value }
      this.set({ params, writing: false, lastWrite, draft: String(result.param.value) })
    } catch (error) {
      this.set({ writing: false, lastWrite: { kind: 'failed', id: param.id, message: describeError(error) } })
    }
  }
}
