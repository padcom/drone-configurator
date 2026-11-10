// The vehicle's parameters: the list and how its download went, the filter and the selection, and the draft of a new value
// (what is typed, why it is not a value, what the metadata finds unusual about it). A change is written through the staged
// changes (useStaged.ts), which share the write lock kept here. It talks to the backend through the client
// (docs/frontend-state.md).
import { type ComputedRef, type ShallowRef, computed, shallowRef, watch } from 'vue'
import { type BackendClient, describeError } from './backend/client'
import type { Param } from './generated/app'
import { type Initial, changedIds, initialOf } from './initialValues'
import { visibleParams } from './paramList'
import { type WriteLock, createWriteLock } from './writeLock'

/** How the parameter list stands: `loading`, or how the last download ended. */
export type ListState = 'none' | 'loading' | 'complete' | 'incomplete' | 'failed'

/** What the parameters need from the rest of the interface. */
export interface ParamsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** Records why the last thing failed. */
  fail: (message: string | null) => void
  /** Why `text` isn't a valid new value for `param` (its type), or null. */
  problemWith: (param: Param, text: string) => string | null
  /** What the metadata finds unusual about `text` as a value for `param` (a warning: the write is still allowed), or null. */
  warningWith: (param: Param, text: string) => string | null
  /** The time now in ms (tests give their own clock). */
  now?: () => number
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
  /** The values at the last complete download (null until there is one), what "changed" is measured against. */
  readonly initial: ShallowRef<Initial | null>
  /**
   * The parameters whose value is not their initial value now. Worked out from the list and the initial values, which change
   * where a value enters (a download, a write, another ground station), never with a telemetry tick.
   */
  readonly changed: ComputedRef<ReadonlySet<string>>
  /** The selected parameter's id, or null. */
  readonly selected: ShallowRef<string | null>
  /** The new value as typed. */
  readonly draft: ShallowRef<string>
  /** Why the draft is not a valid value, or null. */
  readonly draftError: ShallowRef<string | null>
  /** What the metadata finds unusual about the draft (outside its range, not among its values), or null. */
  readonly draftWarning: ShallowRef<string | null>
  /** Held by whichever write is under way (the changes collected, a snapshot): no other starts meanwhile. */
  readonly lock: WriteLock
  /**
   * Downloads the list again. A complete download makes its values the initial ones, unless it is the automatic one that
   * follows a link that came back to the same vehicle (`keepInitial`): that updates the values and keeps what "changed" is
   * measured against, so that a dropped link does not erase every marker. While a write holds the lock it waits for it to be
   * over: a download in the middle of a write would put half-written values in the initial ones.
   */
  refresh: (options?: { keepInitial?: boolean }) => Promise<void>
  /** Forgets the initial values (the session ended, or another vehicle was connected). */
  clearInitial: () => void
  /** Forgets a download that waits for a write (the session ended: no download on an app that is disconnected). */
  cancelDeferred: () => void
  /** Narrows the list. */
  setFilter: (filter: string) => void
  /** Selects a parameter (and drafts its current value). */
  select: (id: string) => void
  /** The user typed a new value. */
  editDraft: (text: string) => void
  /** Reads again what the metadata finds unusual about the draft (the metadata may have changed), and gives it. */
  refreshWarning: () => string | null
  /** A parameter the vehicle announced on its own (another ground station changed it). */
  announced: (param: Param) => void
  /** Replaces a parameter by its newer self (after a write). */
  replace: (param: Param) => void
  /** The parameters matching the filter. */
  visible: () => Param[]
  /** The selected parameter, or null. */
  selectedParam: () => Param | null
}

/** The parameters. */
class Parameters implements ParamsModel {
  readonly params = shallowRef<Param[]>([])
  readonly list = shallowRef<ListState>('none')
  readonly missing = shallowRef<number[]>([])
  readonly filter = shallowRef('')
  readonly initial = shallowRef<Initial | null>(null)
  readonly changed = computed(() => changedIds(this.params.value, this.initial.value))
  readonly selected = shallowRef<string | null>(null)
  readonly draft = shallowRef('')
  readonly draftError = shallowRef<string | null>(null)
  readonly draftWarning = shallowRef<string | null>(null)
  readonly lock = createWriteLock()

  /**
   * Makes the parameters.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: ParamsDeps) {
    // A download that was asked for while a write held the lock is made when the lock is given back.
    watch(this.lock.busy, busy => {
      const { deferred } = this
      if (!busy && deferred) {
        this.deferred = null
        void this.download(deferred.keepInitial)
      }
    })
  }

  /** A download that waits for the write that is under way (the automatic one after a link came back). */
  private deferred: { keepInitial: boolean } | null = null

  /**
   * The values of a download that completed are the initial ones, unless the automatic download after a link came back to the
   * same vehicle keeps what there already is. An incomplete one never replaces them.
   *
   * @param params the downloaded list
   * @param complete whether every parameter arrived
   * @param keepInitial whether this is the automatic download of a link that came back
   */
  private takeInitial(params: Param[], complete: boolean, keepInitial: boolean): void {
    const kept = keepInitial && this.initial.value !== null
    if (complete && !kept) {
      this.initial.value = initialOf(params, this.now())
    }
  }

  /**
   * The time now.
   *
   * @returns milliseconds since the epoch (from the clock of the tests, when they give one)
   */
  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  /**
   * Downloads the list and takes it in.
   *
   * @param keepInitial whether the initial values are kept if there are any
   */
  private async download(keepInitial: boolean): Promise<void> {
    this.list.value = 'loading'

    try {
      const downloaded = await this.deps.client.call('params.list', null)
      this.takeInitial(downloaded.params, downloaded.complete, keepInitial)
      this.params.value = downloaded.params
      this.missing.value = downloaded.missing
      this.list.value = downloaded.complete ? 'complete' : 'incomplete'
    } catch (error) {
      this.list.value = 'failed'
      this.deps.fail(describeError(error))
    }
  }

  async refresh(options: { keepInitial?: boolean } = {}): Promise<void> {
    const keepInitial = options.keepInitial === true
    if (this.lock.busy.value) {
      this.defer(keepInitial)
    } else {
      await this.download(keepInitial)
    }
  }

  /**
   * Not in the middle of a write (the values would be half and half): later, when it is over. Of two that wait, the one that
   * does not keep the initial values (another vehicle) wins.
   *
   * @param keepInitial whether the download that is asked for keeps the initial values
   */
  private defer(keepInitial: boolean): void {
    this.deferred = { keepInitial: keepInitial && (this.deferred?.keepInitial ?? true) }
  }

  cancelDeferred(): void {
    this.deferred = null
  }

  clearInitial(): void {
    this.initial.value = null
  }

  setFilter(filter: string): void {
    this.filter.value = filter
  }

  select(id: string): void {
    const param = this.params.value.find(candidate => candidate.id === id)
    // Pressing the parameter that is selected already keeps what was typed for it.
    if (param && id === this.selected.value) {
      return
    }
    this.show(param)
  }

  /**
   * Makes a parameter the selected one, with its value in the draft and nothing said about the draft yet.
   *
   * @param param the parameter, or undefined for none
   */
  private show(param: Param | undefined): void {
    this.selected.value = param?.id ?? null
    this.draft.value = param === undefined ? '' : String(param.value)
    this.draftError.value = null
    this.refreshWarning()
  }

  editDraft(text: string): void {
    const param = this.selectedParam()
    this.draft.value = text
    this.draftError.value = param ? this.deps.problemWith(param, text) : null
    this.refreshWarning()
  }

  /**
   * Whether the draft is the value the vehicle has already (which is not unusual, whatever the metadata says of it).
   *
   * @param param the selected parameter
   * @returns true if the draft is that number
   */
  private isCurrent(param: Param): boolean {
    const text = this.draft.value.trim()

    return text !== '' && Number(text) === param.value
  }

  refreshWarning(): string | null {
    const param = this.selectedParam()
    const warning = param && !this.isCurrent(param) ? this.deps.warningWith(param, this.draft.value) : null
    this.draftWarning.value = warning

    return warning
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
