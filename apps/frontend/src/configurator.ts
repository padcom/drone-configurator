// The dashboard's state and actions, without the DOM (render.ts draws it), so every interaction is
// testable with the mock backend.
import { Communicator, CommunicatorError, type Transport } from '@pico-desktop/communicator'
import { type Connection, type ConnectRequest, type Param, type Services, type Telemetry, validate } from './generated/app'

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
  }

  constructor(transport: Transport, private readonly ui: Ui) {
    this.communicator = new Communicator<Services>({ transport, validate })
    void this.watch()
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
    this.set({ connection: { state: 'connecting' }, error: null })
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
