// The flight logs on the vehicle: the list, which are selected, the download of the selected ones with each log's progress,
// and the erase. The backend (so far only the mock) does the work; this keeps what the screen shows, and refuses early what the
// backend would refuse anyway (a download or an erase while the vehicle is armed, or not known to be disarmed, or while a
// download runs): the screen says why, and nothing is sent. Nothing here downloads on its own: not on connecting, and not after
// landing (the "auto-download" preference is a setting only, until the backend can act on it).
import { type ComputedRef, type Ref, type ShallowRef, computed, ref, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import type { Connection, LogsProgress, Telemetry, VehicleLog } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import { say } from '@/i18n/say'
import { type Blocked, blockedBy, undownloadedIds } from '@/lib/logs/vehicleLogs'

/** What the logs need from the rest of the interface. */
export interface LogsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The vehicle's connection. */
  connection: Readonly<Ref<Connection>>
  /** The latest telemetry (the armed state is read from it). */
  telemetry: Readonly<Ref<Telemetry | null>>
  /** How long to wait before asking again when the backend is busy (ms; a second by default). */
  retryMs?: number
  /** Whether the parameter list is being downloaded (the backend is busy with it, and the list of logs waits for it). */
  parametersLoading?: () => boolean
}

/** A backend that is busy when the list is asked for (the parameters are coming) is asked again this often, this many times. */
const LIST_RETRY_MS = 1000
const LIST_RETRIES = 30

/** What the last download or erase came to. */
export type Outcome
  = | { kind: 'downloaded', count: number, stopped: boolean }
    | { kind: 'erased', erased: number, kept: number }

/** The vehicle's logs, as refs and actions. */
export interface LogsModel {
  /** The logs on the vehicle, as last listed. */
  readonly logs: ShallowRef<VehicleLog[]>
  /** Whether the list has been read since the vehicle was connected. */
  readonly listed: Readonly<Ref<boolean>>
  /** The ids selected for the download. */
  readonly selected: ShallowRef<number[]>
  /** What the download said of each log last. */
  readonly progress: ShallowRef<Record<number, LogsProgress>>
  /** Whether the list is being read. */
  readonly loading: Readonly<Ref<boolean>>
  /** Whether a download is under way. */
  readonly running: Readonly<Ref<boolean>>
  /** Why the logs cannot be downloaded or erased now, or null. */
  readonly blocked: ComputedRef<Blocked>
  /** The backend has no logs to offer (it does not know the methods yet): the screen says so, and has no controls. */
  readonly unavailable: Readonly<Ref<boolean>>
  /** Whether the backend can erase the logs on the vehicle (as last listed). */
  readonly canErase: Readonly<Ref<boolean>>
  /** What the last call that failed said. */
  readonly error: ShallowRef<string | null>
  /** What the last download or erase came to. */
  readonly outcome: ShallowRef<Outcome | null>
  /** Reads the list. */
  refresh: () => Promise<void>
  /** Selects a log, or lets it go. */
  toggle: (id: number) => void
  /** Selects every log that is not downloaded yet. */
  selectNew: () => void
  /** Selects none. */
  clearSelection: () => void
  /** Downloads the selected logs, one after the other. */
  download: () => Promise<void>
  /** Stops the download; what was fetched is kept. */
  cancel: () => Promise<void>
  /** Erases the logs that were downloaded (the others stay). */
  erase: () => Promise<void>
  /** The vehicle is gone, or another one is there: forgets what was listed, selected and downloaded. */
  reset: () => void
}

/** The vehicle's logs. */
class VehicleLogs implements LogsModel {
  readonly logs = shallowRef<VehicleLog[]>([])
  readonly selected = shallowRef<number[]>([])
  readonly progress = shallowRef<Record<number, LogsProgress>>({})
  readonly error = shallowRef<string | null>(null)
  readonly outcome = shallowRef<Outcome | null>(null)
  readonly listed = ref(false)
  readonly loading = ref(false)
  readonly running = ref(false)
  readonly unavailable = ref(false)
  readonly canErase = ref(false)
  readonly blocked: ComputedRef<Blocked>
  /** Goes up with every reset: an answer that comes for an earlier vehicle is dropped. */
  private epoch = 0
  /** How many reads of the list are under way (of the current vehicle): `loading` is on while there are any. */
  private reading = 0

  /**
   * Makes the model, and listens to the progress the backend reports.
   *
   * @param deps the client, the connection and the telemetry
   */
  constructor(private readonly deps: LogsDeps) {
    this.blocked = computed(() => blockedBy(
      this.deps.connection.value.state === 'connected',
      armedOf(this.deps.telemetry.value),
      this.running.value,
    ))
    deps.client.onEvent('logs.progress', progress => {
      if (this.running.value) {
        this.progress.value = { ...this.progress.value, [progress.id]: progress }
      }
    })
  }

  /**
   * Records a call that failed: a backend that does not know the methods makes the logs unavailable (no error to show), any
   * other failure is the error shown.
   *
   * @param error what the call threw
   * @param quietBusy whether a backend that is busy (BUSY) is left to the caller, who asks again, and not recorded as an error
   * @returns `busy` for that, else `failed`
   */
  private failed(error: unknown, quietBusy = false): 'failed' | 'busy' {
    const { code } = toBackendError(error)
    if (quietBusy && code === 'BUSY') {
      return 'busy'
    }
    this.record(code, error)

    return 'failed'
  }

  /**
   * Notes a failure: the logs are unavailable (a backend that does not know the methods), or the error is shown.
   *
   * @param code its code
   * @param error what the call threw
   */
  private record(code: string, error: unknown): void {
    if (code === 'UNKNOWN_METHOD') {
      this.unavailable.value = true
    } else {
      this.error.value = describeError(error)
    }
  }

  /**
   * Makes a call for this vehicle: what it answers is used only if the vehicle is still the one it was asked about, and a
   * failure is recorded the same way.
   *
   * @param call makes the call
   * @param apply uses the answer
   * @param quietBusy whether a backend that is busy (BUSY) is told to the caller, who asks again, and not recorded as an error
   * @returns how it went: `stale` when another vehicle has taken the place, and nothing was used or recorded
   */
  private async attempt<T>(
    call: () => Promise<T>,
    apply: (answer: T) => void,
    quietBusy: boolean,
  ): Promise<'ok' | 'failed' | 'busy' | 'stale'> {
    const { epoch } = this
    let answer: T

    try {
      answer = await call()
    } catch (error) {
      if (epoch !== this.epoch) {
        return 'stale'
      }

      return this.failed(error, quietBusy)
    }

    if (epoch !== this.epoch) {
      return 'stale'
    }
    apply(answer)

    return 'ok'
  }

  async refresh(): Promise<void> {
    // What this read does it does only for the vehicle it began with: after a reset (a disconnect, another vehicle) it stops
    // quietly, with no more asking and no error for the next vehicle.
    const { epoch } = this
    this.reading += 1
    this.loading.value = true
    await this.listFrom(epoch, 0)

    if (epoch === this.epoch) {
      this.reading -= 1
      this.loading.value = this.reading > 0
    }
  }

  /**
   * Whether a backend that was busy is worth asking again: while the parameter list is still coming (the file transfer does one
   * thing at a time, and the page asks right after connecting), and in any case once more (it may have just finished).
   *
   * @param tried how many times it was busy already
   * @returns true to ask again
   */
  private worthAsking(tried: number): boolean {
    return tried < LIST_RETRIES && (this.parametersComing() || tried < 1)
  }

  /**
   * Whether the parameter list is being downloaded (not known: yes, so that the cap alone bounds the asking).
   *
   * @returns true while it is
   */
  private parametersComing(): boolean {
    return this.deps.parametersLoading?.() ?? true
  }

  /**
   * Reads the list. A backend that is busy is asked again after a moment, without an error on the screen, for as long as it is
   * worth it; then the error is shown, in words.
   *
   * @param epoch the vehicle this read began with
   * @param tried how many times it was busy already
   */
  private async listFrom(epoch: number, tried: number): Promise<void> {
    const how = await this.attempt(() => this.deps.client.call('logs.vehicle.list', null), ({ logs, canErase }) => {
      this.logs.value = logs
      this.canErase.value = canErase
      this.selected.value = this.pickable()
      this.listed.value = true
      this.error.value = null
    }, true)
    if (how === 'busy' && epoch === this.epoch) {
      await this.busyThen(epoch, tried)
    }
  }

  /**
   * The backend was busy: ask again after a moment if that is worth it and the vehicle is still the same, else say so in words.
   *
   * @param epoch the vehicle this read began with
   * @param tried how many times it was busy already
   */
  private async busyThen(epoch: number, tried: number): Promise<void> {
    if (!this.worthAsking(tried)) {
      this.error.value = say('logs.vehicle.busy')

      return
    }
    await new Promise<void>(resolve => {
      setTimeout(resolve, this.deps.retryMs ?? LIST_RETRY_MS)
    })

    if (epoch === this.epoch) {
      await this.listFrom(epoch, tried + 1)
    }
  }

  toggle(id: number): void {
    this.selected.value = this.selected.value.includes(id)
      ? this.selected.value.filter(selected => selected !== id)
      : [...this.selected.value, id]
  }

  selectNew(): void {
    this.selected.value = undownloadedIds(this.logs.value)
  }

  clearSelection(): void {
    this.selected.value = []
  }

  /**
   * The selected logs that are still to be downloaded.
   *
   * @returns their ids
   */
  private pickable(): number[] {
    const wanted = undownloadedIds(this.logs.value)

    return this.selected.value.filter(id => wanted.includes(id))
  }

  /**
   * Whether a download of these logs may begin.
   *
   * @param ids the logs to fetch
   * @returns true when there are some and nothing blocks it
   */
  private ready(ids: number[]): boolean {
    return this.blocked.value === null && ids.length > 0
  }

  async download(): Promise<void> {
    const ids = this.pickable()
    if (!this.ready(ids)) {
      return
    }
    this.progress.value = {}
    this.outcome.value = null
    this.running.value = true
    // Why the backend stopped a download (a log that failed its check, the vehicle arming), in its words.
    let reported: string | null = null
    const how = await this.attempt(() => this.deps.client.call('logs.download', { ids }), done => {
      this.outcome.value = { kind: 'downloaded', count: done.ids.length, stopped: done.stopped }
      reported = done.error ?? null
      this.error.value = reported
      // A download that was stopped leaves no log "downloading" or "queued": the rows say what the list says.
      this.progress.value = done.stopped ? {} : this.progress.value
    }, false)
    if (how === 'stale') {
      return
    }
    this.progress.value = how === 'failed' ? {} : this.progress.value
    this.running.value = false
    // What came whole is no longer to be downloaded: the list says which, once read again.
    await this.refresh()
    this.keepReason(reported)
  }

  /**
   * Reading the list again clears an error; the reason a download stopped stays.
   *
   * @param reported the reason the backend gave, if it gave one
   */
  private keepReason(reported: string | null): void {
    this.error.value = reported ?? this.error.value
  }

  async cancel(): Promise<void> {
    try {
      await this.deps.client.call('logs.cancel', null)
    } catch (error) {
      this.failed(error)
    }
  }

  async erase(): Promise<void> {
    if (this.blocked.value !== null) {
      return
    }
    await this.attempt(() => this.deps.client.call('logs.erase', null), ({ erased, kept }) => {
      this.outcome.value = { kind: 'erased', erased: erased.length, kept }
      this.error.value = null
      this.progress.value = {}
    }, false)
    await this.refresh()
  }

  reset(): void {
    this.epoch += 1
    this.loading.value = false
    this.reading = 0
    this.unavailable.value = false
    this.canErase.value = false
    this.logs.value = []
    this.selected.value = []
    this.progress.value = {}
    this.outcome.value = null
    this.error.value = null
    this.listed.value = false
    this.running.value = false
  }
}

/**
 * Makes the vehicle's logs.
 *
 * @param deps the client, the connection and the telemetry
 * @returns the model
 */
export function useVehicleLogs(deps: LogsDeps): LogsModel {
  return new VehicleLogs(deps)
}
