// The vehicle's parameters: the list and how its download went, the filter and the selection, the draft of a new value,
// and writing it. It talks to the backend through the client (docs/frontend-state.md).
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from './backend/client'
import type { Param, ParamWriteResult } from './generated/app'
import { visibleParams } from './paramList'

/** How the last write went. */
export type WriteStatus
  = | { kind: 'verified', id: string, value: number }
    | { kind: 'changed', id: string, asked: number, reported: number }
    | { kind: 'failed', id: string, message: string }

/** How the parameter list stands: `loading`, or how the last download ended. */
export type ListState = 'none' | 'loading' | 'complete' | 'incomplete' | 'failed'

/** What the parameters need from the rest of the interface. */
export interface ParamsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** Records why the last thing failed. */
  fail: (message: string | null) => void
  /** Whether a vehicle is connected. */
  isConnected: () => boolean
  /** Asks the user to confirm `question`; a write goes ahead only on true. */
  confirm: (question: string) => Promise<boolean>
  /** Why `text` isn't a valid new value for `param` (its type, then its metadata), or null. */
  problemWith: (param: Param, text: string) => string | null
}

/** The parameters, as refs and actions. */
export interface ParamsModel {
  /** Every parameter, as downloaded. */
  readonly params: ShallowRef<Param[]>
  /** How the list stands. */
  readonly list: ShallowRef<ListState>
  /** The indexes that never arrived. */
  readonly missing: ShallowRef<number[]>
  /** What the user typed to narrow the list. */
  readonly filter: ShallowRef<string>
  /** The selected parameter's id, or null. */
  readonly selected: ShallowRef<string | null>
  /** The new value as typed. */
  readonly draft: ShallowRef<string>
  /** Why the draft is not a valid value, or null. */
  readonly draftError: ShallowRef<string | null>
  /** Whether a write is under way. */
  readonly writing: ShallowRef<boolean>
  /** How the last write went. */
  readonly lastWrite: ShallowRef<WriteStatus | null>
  /** Downloads the list again. */
  refresh: () => Promise<void>
  /** Narrows the list. */
  setFilter: (filter: string) => void
  /** Selects a parameter (and drafts its current value). */
  select: (id: string) => void
  /** The user typed a new value. */
  editDraft: (text: string) => void
  /** Writes the draft after the user confirms; the vehicle's read-back decides the outcome. */
  write: () => Promise<void>
  /** A parameter the vehicle announced on its own (another ground station changed it). */
  announced: (param: Param) => void
  /** Replaces a parameter by its newer self (after a write). */
  replace: (param: Param) => void
  /** A write cannot be under way any more (the vehicle is gone). */
  stopWriting: () => void
  /** The parameters matching the filter. */
  visible: () => Param[]
  /** The selected parameter, or null. */
  selectedParam: () => Param | null
}

/**
 * How a write ended, for the interface.
 *
 * @param param the parameter written
 * @param asked the value asked for
 * @param result what the vehicle reported after the write
 * @returns the status
 */
function statusOf(param: Param, asked: number, result: ParamWriteResult): WriteStatus {
  return result.verified
    ? { kind: 'verified', id: param.id, value: result.param.value }
    : { kind: 'changed', id: param.id, asked, reported: result.param.value }
}

/** The parameters. */
class Parameters implements ParamsModel {
  readonly params = shallowRef<Param[]>([])
  readonly list = shallowRef<ListState>('none')
  readonly missing = shallowRef<number[]>([])
  readonly filter = shallowRef('')
  readonly selected = shallowRef<string | null>(null)
  readonly draft = shallowRef('')
  readonly draftError = shallowRef<string | null>(null)
  readonly writing = shallowRef(false)
  readonly lastWrite = shallowRef<WriteStatus | null>(null)

  /**
   * Makes the parameters.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: ParamsDeps) {}

  async refresh(): Promise<void> {
    this.list.value = 'loading'

    try {
      const downloaded = await this.deps.client.call('params.list', null)
      this.params.value = downloaded.params
      this.missing.value = downloaded.missing
      this.list.value = downloaded.complete ? 'complete' : 'incomplete'
    } catch (error) {
      this.list.value = 'failed'
      this.deps.fail(describeError(error))
    }
  }

  setFilter(filter: string): void {
    this.filter.value = filter
  }

  select(id: string): void {
    const param = this.params.value.find(candidate => candidate.id === id)
    this.selected.value = param ? id : null
    this.draft.value = param ? String(param.value) : ''
    this.draftError.value = null
    this.forgetOtherWrites(id)
  }

  /**
   * How the last write went belongs to the parameter it was for: going to another one (and back) starts clean.
   *
   * @param id the parameter now selected
   */
  private forgetOtherWrites(id: string): void {
    if (this.lastWrite.value?.id !== id) {
      this.lastWrite.value = null
    }
  }

  editDraft(text: string): void {
    const param = this.selectedParam()
    this.draft.value = text
    this.draftError.value = param ? this.deps.problemWith(param, text) : null
  }

  /**
   * Sends the write and records how it went.
   *
   * @param param the parameter
   * @param value the new value
   */
  private async send(param: Param, value: number): Promise<void> {
    const { id, kind, type } = param
    try {
      const result = await this.deps.client.call('params.write', { id, kind, type, value })
      this.replace(result.param)
      this.lastWrite.value = statusOf(param, value, result)
      this.draft.value = String(result.param.value)
    } catch (error) {
      this.lastWrite.value = { kind: 'failed', id, message: describeError(error) }
    }
    this.writing.value = false
  }

  /**
   * The selected parameter, if a write can start now: a vehicle is connected and no write is under way.
   *
   * @returns the parameter, or null
   */
  private startable(): Param | null {
    const param = this.selectedParam()

    return param && this.deps.isConnected() && !this.writing.value ? param : null
  }

  async write(): Promise<void> {
    const param = this.startable()
    if (!param) {
      return
    }
    const problem = this.deps.problemWith(param, this.draft.value)
    if (problem) {
      this.draftError.value = problem

      return
    }
    const value = Number(this.draft.value.trim())
    if (await this.deps.confirm(`Set ${param.id} from ${param.value} to ${value}?`)) {
      this.writing.value = true
      this.lastWrite.value = null
      await this.send(param, value)
    }
  }

  /**
   * Whether the user has not started editing the draft of a parameter: it still holds the value on the vehicle.
   *
   * @param param the parameter that was announced
   * @param old the parameter as it was
   * @returns true if the draft can follow the announcement
   */
  private untouched(param: Param, old: Param | undefined): boolean {
    return this.selected.value === param.id && old !== undefined && this.draft.value === String(old.value)
  }

  announced(param: Param): void {
    const old = this.params.value.find(candidate => candidate.id === param.id)
    if (this.untouched(param, old)) {
      this.draft.value = String(param.value)
    }
    if (old) {
      this.replace(param)
    } else {
      this.params.value = [...this.params.value, param]
    }
  }

  replace(param: Param): void {
    this.params.value = this.params.value.map(candidate => candidate.id === param.id ? param : candidate)
  }

  stopWriting(): void {
    this.writing.value = false
  }

  visible(): Param[] {
    return visibleParams(this.params.value, this.filter.value)
  }

  selectedParam(): Param | null {
    return this.params.value.find(candidate => candidate.id === this.selected.value) ?? null
  }
}

/**
 * Makes the parameters.
 *
 * @param deps the client and the rest of the interface
 * @returns the refs and the actions
 */
export function useParams(deps: ParamsDeps): ParamsModel {
  return new Parameters(deps)
}
