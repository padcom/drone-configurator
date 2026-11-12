// The flight logs on the vehicle: the list, which are selected, the download of the selected ones with each log's progress,
// and the erase. The backend (so far only the mock) does the work; this keeps what the screen shows, and refuses early what the
// backend would refuse anyway (a download or an erase while the vehicle is armed, or not known to be disarmed, or while a
// download runs): the screen says why, and nothing is sent. Nothing here downloads on its own: not on connecting, and not after
// landing (the "auto-download" preference is a setting only, until the backend can act on it).
import { type ComputedRef, type Ref, type ShallowRef, computed, ref, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import type { Connection, LogsProgress, Telemetry, VehicleLog } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import { type Blocked, blockedBy, undownloadedIds } from '@/lib/logs/vehicleLogs'

/** What the logs need from the rest of the interface. */
export interface LogsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The vehicle's connection. */
  connection: Readonly<Ref<Connection>>
  /** The latest telemetry (the armed state is read from it). */
  telemetry: Readonly<Ref<Telemetry | null>>
}

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
  /** The vehicle is gone: forgets what was listed. */
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
  readonly blocked: ComputedRef<Blocked>

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
      this.progress.value = { ...this.progress.value, [progress.id]: progress }
    })
  }

  async refresh(): Promise<void> {
    this.loading.value = true

    try {
      this.logs.value = (await this.deps.client.call('logs.vehicle.list', null)).logs
      const known = new Set(this.logs.value.map(log => log.id))
      this.selected.value = this.selected.value.filter(id => known.has(id))
      this.listed.value = true
      this.error.value = null
    } catch (error) {
      this.error.value = describeError(error)
    } finally {
      this.loading.value = false
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

  async download(): Promise<void> {
    const ids = this.selected.value.filter(id => undownloadedIds(this.logs.value).includes(id))
    if (this.blocked.value !== null || ids.length === 0) {
      return
    }
    this.progress.value = {}
    this.outcome.value = null
    this.running.value = true

    try {
      const done = await this.deps.client.call('logs.download', { ids })
      this.outcome.value = { kind: 'downloaded', count: done.ids.length, stopped: done.stopped }
      this.error.value = null
    } catch (error) {
      this.error.value = describeError(error)
    } finally {
      this.running.value = false
    }
    // What came whole is no longer to be downloaded: the list says which, once read again.
    await this.refresh()
    this.selected.value = this.selected.value.filter(id => undownloadedIds(this.logs.value).includes(id))
  }

  async cancel(): Promise<void> {
    try {
      await this.deps.client.call('logs.cancel', null)
    } catch (error) {
      this.error.value = describeError(error)
    }
  }

  async erase(): Promise<void> {
    if (this.blocked.value !== null) {
      return
    }
    try {
      const { erased, kept } = await this.deps.client.call('logs.erase', null)
      this.outcome.value = { kind: 'erased', erased: erased.length, kept }
      this.error.value = null
      this.progress.value = {}
    } catch (error) {
      this.error.value = describeError(error)
    }
    await this.refresh()
  }

  reset(): void {
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
