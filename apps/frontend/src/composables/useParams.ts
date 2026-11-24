// The vehicle's parameters: the list and how its download went, the filter and the selection, and the draft of a new value
// (what is typed, why it is not a value, what the metadata finds unusual about it). A change is written through the staged
// changes (useStaged.ts), which share the write lock kept here. It talks to the backend through the client
// (docs/frontend-state.md).
import { type ComputedRef, type ShallowRef, computed, shallowRef, watch } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import type { Param, ParamList, ParamListRequest, ParamsProgress, SavedParams } from '@/generated/app'
import { type DownloadToast, startDownloadToast } from '@/lib/params/downloadToast'
import { type Toasts, useToasts } from './toasts'
import { type Defaults, defaultsOf, modifiedIds } from '@/lib/params/defaults'
import { type Initial, changedIds, initialOf } from '@/lib/params/initialValues'
import { sortedByName, withInPlace } from '@/lib/params/naturalOrder'
import { visibleParams } from '@/lib/params/paramList'
import { canonParam, canonical, showNumber, typedValue } from '@/lib/params/paramValue'
import { type WriteLock, createWriteLock } from './writeLock'

/** How the parameter list stands: `loading`, or how the last download ended. */
export type ListState = 'none' | 'loading' | 'complete' | 'incomplete' | 'failed'

/** How a download came, as the backend reports it. */
export interface DownloadInfo {
  /** `ftp` (the vehicle's parameter file) or `list`; absent from a backend that does not say. */
  source?: ParamList['source']
  /** Why the file transfer was not used, when the list was. */
  fallback?: string
  /** How long it took (ms). */
  elapsedMs?: number
  /** How many parameters a resume (after the link came back to the same vehicle) reused, not asking for them again. */
  reused?: number
}

/** The list that is shown while a download runs: this vehicle's as its last complete download left it (#38). */
export interface CachedInfo {
  /** When that download ended (ms since 1970). */
  savedAt: number
  /** How many parameters it has. */
  count: number
}

/** How a download is asked for. */
export interface RefreshOptions {
  /** Keep the initial values if there are any (the automatic download after a link came back to the same vehicle). */
  keepInitial?: boolean
  /**
   * Show the vehicle's list as its last complete download left it (kept by the backend across sessions) while this download
   * runs, when the backend has one: the download that connects a vehicle. It is replaced when the download ends, and taken
   * away when it fails or is cancelled.
   */
  fromCache?: boolean
}

/** What the parameters need from the rest of the interface. */
export interface ParamsDeps {
  /** The toasts the download is shown in (the application's unless a test gives its own). */
  toasts?: Toasts
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
  /** The firmware's default of each parameter, when the last download brought them (else null: they are not known). */
  readonly defaults: ShallowRef<Defaults | null>
  /** The parameters whose value is not the firmware's default now (none while the defaults are not known). */
  readonly modified: ComputedRef<ReadonlySet<string>>
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
  /** How far the download that runs is (null when none does, or before the first report). */
  readonly progress: ShallowRef<ParamsProgress | null>
  /** How the last download came: by which way, why not by the other, how long it took (null until there is one). */
  readonly downloadInfo: ShallowRef<DownloadInfo | null>
  /**
   * How the download that has just ended came: set when a download gives a list, cleared when the next one starts (a cancelled or
   * failed download leaves it empty, unlike `downloadInfo`, which keeps the last list's). What is said to the ear follows this.
   */
  readonly downloadEnded: ShallowRef<DownloadInfo | null>
  /** Set while the list shown is the one kept from this vehicle's last complete download (a download runs to replace it). */
  readonly fromCache: ShallowRef<CachedInfo | null>
  /** Stops the download that runs (the list stays as it was, with its initial values); nothing happens when none runs. */
  cancel: () => Promise<void>
  /**
   * Downloads the list again. A complete download makes its values the initial ones, unless it is the automatic one that
   * follows a link that came back to the same vehicle (`keepInitial`): that updates the values and keeps what "changed" is
   * measured against, so that a dropped link does not erase every marker, and asks the backend to resume (it reuses what it
   * heard of this vehicle and asks the vehicle only for what it lacks). While a write holds the lock it waits for it to be
   * over: a download in the middle of a write would put half-written values in the initial ones. With `fromCache`, the list
   * the backend kept of this vehicle is shown while it runs.
   */
  refresh: (options?: RefreshOptions) => Promise<void>
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

/**
 * What `params.list` is asked: the automatic download after a link came back to the same vehicle resumes (the backend reuses
 * what it heard of this vehicle, and asks it only for what it lacks); any other is a whole download.
 *
 * @param resume whether it is that automatic download
 * @returns the request
 */
const requestFor = (resume: boolean): ParamListRequest => (resume ? { resume: true } : {})

/** The parameters. */
class Parameters implements ParamsModel {
  readonly params = shallowRef<Param[]>([])
  readonly list = shallowRef<ListState>('none')
  readonly missing = shallowRef<number[]>([])
  readonly filter = shallowRef('')
  readonly initial = shallowRef<Initial | null>(null)
  readonly changed = computed(() => changedIds(this.params.value, this.initial.value))
  readonly defaults = shallowRef<Defaults | null>(null)
  readonly modified = computed(() => modifiedIds(this.params.value, this.defaults.value))
  readonly selected = shallowRef<string | null>(null)
  readonly draft = shallowRef('')
  readonly draftError = shallowRef<string | null>(null)
  readonly draftWarning = shallowRef<string | null>(null)
  readonly lock = createWriteLock()
  readonly progress = shallowRef<ParamsProgress | null>(null)
  readonly downloadInfo = shallowRef<DownloadInfo | null>(null)
  readonly downloadEnded = shallowRef<DownloadInfo | null>(null)
  readonly fromCache = shallowRef<CachedInfo | null>(null)
  /** How many downloads were started: tells the one that runs from one that has ended. */
  private downloads = 0
  /** Whether the user has asked for the download that runs to stop (so that the ABORTED that follows is not a failure). */
  private cancelling = false

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
        void this.download(deferred)
      }
    })
  }

  /** A download that waits for the write that is under way (the automatic one after a link came back). */
  private deferred: Required<RefreshOptions> | null = null

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
   * The firmware's defaults of a list that brought them. A resume (the link came back to the same vehicle) brings none, and keeps
   * the ones there are; any other download without them means they are not known.
   *
   * @param params the downloaded list
   * @param known whether the list says it came with the defaults
   * @param keepInitial whether this is the automatic download of a link that came back
   */
  private takeDefaults(params: Param[], known: boolean | undefined, keepInitial: boolean): void {
    const defaults = defaultsOf(params, known)
    if (defaults !== null || !keepInitial) {
      this.defaults.value = defaults
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
   * @param options how it is asked for
   */
  private async download(options: Required<RefreshOptions>): Promise<void> {
    const { keepInitial } = options
    const before = this.list.value === 'loading' ? 'none' : this.list.value
    this.begin(options.fromCache)
    const toast = startDownloadToast(this.deps.toasts ?? useToasts(), () => void this.cancel())
    const stop = this.deps.client.onEvent('params.progress', progress => {
      this.progress.value = progress
      toast.progress(progress)
    })

    try {
      this.take(await this.deps.client.call('params.list', requestFor(keepInitial)), keepInitial)
      toast.done(this.params.value.length, this.missing.value.length)
    } catch (error) {
      this.ended(error, before, toast)
    } finally {
      stop()
      this.progress.value = null
      this.cancelling = false
    }
  }

  /**
   * A download starts: it is loading, with nothing said of how it went yet, and the kept list is asked for when it is wanted.
   *
   * @param fromCache whether to show the list the backend kept of the vehicle meanwhile
   */
  private begin(fromCache: boolean): void {
    this.list.value = 'loading'
    this.progress.value = null
    this.downloadEnded.value = null
    this.cancelling = false
    this.downloads += 1

    if (fromCache) {
      void this.showCached(this.downloads)
    }
  }

  /**
   * Shows the list the backend kept of this vehicle, if it has one and download `which` still runs (a list that came first is
   * not replaced by an older one). It is no failure when there is none.
   *
   * @param which the download it is shown for
   */
  private async showCached(which: number): Promise<void> {
    const saved = await this.deps.client.call('params.cached', null).catch(() => null)
    if (saved !== null && this.downloads === which && this.list.value === 'loading') {
      this.showSaved(saved)
    }
  }

  /**
   * Shows a kept list: its values are not the vehicle's now, so they are not the initial ones.
   *
   * @param saved what the backend kept
   */
  private showSaved(saved: SavedParams): void {
    this.params.value = sortedByName(saved.params.map(canonParam))
    this.missing.value = []
    this.fromCache.value = { savedAt: Number(saved.savedAt), count: saved.params.length }
  }

  /** Takes away a kept list that is shown: a download that did not replace it leaves nothing that could be taken as now. */
  private dropCached(): void {
    if (this.fromCache.value !== null) {
      this.params.value = []
      this.missing.value = []
      this.fromCache.value = null
    }
  }

  /**
   * Takes in a downloaded list. The values are the numbers the vehicle holds (a float comes over the wire widened to a double),
   * and the list is in the order of the names, made once here: the list, the groups, the favourites and the search follow it.
   *
   * @param downloaded the result of `params.list`
   * @param keepInitial whether the initial values are kept if there are any
   */
  private take(downloaded: ParamList, keepInitial: boolean): void {
    const params = sortedByName(downloaded.params.map(canonParam))
    this.fromCache.value = null
    this.takeInitial(params, downloaded.complete, keepInitial)
    this.takeDefaults(params, downloaded.defaults, keepInitial)
    this.params.value = params
    this.missing.value = downloaded.missing
    this.list.value = downloaded.complete ? 'complete' : 'incomplete'
    const { source, fallback, elapsedMs, reused } = downloaded
    this.downloadInfo.value = { source, fallback, elapsedMs, ...reused === undefined ? {} : { reused } }
    this.downloadEnded.value = this.downloadInfo.value
  }

  /**
   * A download that did not give a list. One the user cancelled is no failure: the list stays as it was, and the toast says so.
   *
   * @param error what the call threw
   * @param before how the list stood before the download
   * @param toast the toast of the download
   */
  private ended(error: unknown, before: ListState, toast: DownloadToast): void {
    this.dropCached()

    if (this.cancelling && toBackendError(error).code === 'ABORTED') {
      this.list.value = before
      toast.cancelled()
    } else {
      this.list.value = 'failed'
      toast.failed()
      this.deps.fail(describeError(error))
    }
  }

  async cancel(): Promise<void> {
    if (this.list.value !== 'loading') {
      return
    }
    this.cancelling = true
    // The download fails with ABORTED when the backend stops it; a backend that has none running (or fails) leaves it be.
    await this.deps.client.call('params.cancel', null).catch(() => undefined)
  }

  async refresh(options: RefreshOptions = {}): Promise<void> {
    const asked = { keepInitial: options.keepInitial === true, fromCache: options.fromCache === true }
    if (this.lock.busy.value) {
      this.defer(asked)
    } else {
      await this.download(asked)
    }
  }

  /**
   * Not in the middle of a write (the values would be half and half): later, when it is over. Of two that wait, the one that
   * does not keep the initial values (another vehicle) wins.
   *
   * @param asked how the download that is asked for is asked for (a kept list is shown if either asks for it)
   */
  private defer(asked: Required<RefreshOptions>): void {
    const waiting = this.deferred ?? { keepInitial: true, fromCache: false }
    this.deferred = { keepInitial: asked.keepInitial && waiting.keepInitial, fromCache: asked.fromCache || waiting.fromCache }
  }

  cancelDeferred(): void {
    this.deferred = null
  }

  clearInitial(): void {
    this.initial.value = null
    this.defaults.value = null
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
    this.draft.value = param === undefined ? '' : showNumber(param.value)
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

    return text !== '' && typedValue(param, text) === canonical(param, param.value)
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
    return this.selected.value === param.id && old !== undefined && this.draft.value === showNumber(old.value)
  }

  announced(param: Param): void {
    const old = this.params.value.find(candidate => candidate.id === param.id)
    const held = canonParam(param)
    if (this.untouched(held, old)) {
      this.draft.value = showNumber(held.value)
    }
    if (old) {
      this.replace(held)
    } else {
      this.params.value = withInPlace(this.params.value, held)
    }
  }

  replace(param: Param): void {
    const held = canonParam(param)
    this.params.value = this.params.value.map(candidate => candidate.id === held.id ? held : candidate)
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
