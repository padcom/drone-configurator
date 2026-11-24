// The comparison of the vehicle's parameters with a parameter file, a snapshot (of this vehicle or another) or the firmware's
// defaults (#40): the rows side by side, which show (only the differences, a group, a search), and the rows the user copies
// across. Nothing is written from here: the rows copied across go to the review (useSnapshots.show), ticked, and are written
// from there after the same confirmation, one by one and read back, and never while the vehicle may be armed.
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import { say } from '@/i18n/say'
import type { Connection, Param } from '@/generated/app'
import type { Metadata } from '@/lib/params/metadata'
import {
  type CompareFilter,
  type CompareRow,
  type CompareSide,
  compareValues,
  copyable,
  defaultsSide,
  sideOfText,
} from '@/lib/params/paramCompare'
import type { Review } from '@/lib/params/snapshot'
import type { SnapshotsModel } from './useSnapshots'

/** What the comparison needs from the rest of the interface. */
export interface CompareDeps {
  /** The link to the backend: its dialog gives the file, and it reads the defaults from the vehicle. */
  client: BackendClient
  /** The vehicle's parameters: the comparison follows them (a value written shows as the same at once). */
  params: ShallowRef<Param[]>
  /** The connection: the vehicle a snapshot is compared with, and whether the defaults can be read. */
  connection: ShallowRef<Connection>
  /** The parameter metadata, when loaded: its read-only parameters are not copied, and its ranges give warnings. */
  metadata: () => Metadata
  /** The review the rows copied across go to. */
  snapshots: Pick<SnapshotsModel, 'show'>
}

/** The filter the comparison opens with: only the differences, every group, no search. */
export const ALL_DIFFERENCES: CompareFilter = { onlyDifferences: true, group: '', search: '' }

/** The comparison, as refs and actions. */
export interface CompareModel {
  /** The other side, once it is loaded. */
  readonly side: ShallowRef<CompareSide | null>
  /** Why the other side could not be loaded. */
  readonly error: ShallowRef<string | null>
  /** Whether the defaults are being read from the vehicle. */
  readonly loading: ShallowRef<boolean>
  /** The rows the user copies across. */
  readonly picked: ShallowRef<string[]>
  /** Which rows show. */
  readonly filter: ShallowRef<CompareFilter>
  /** Every row: the vehicle's parameters in its order, then what only the other side has. */
  readonly rows: ComputedRef<CompareRow[]>
  /** Whether the comparison is open (loaded, loading, or failed to load). */
  readonly open: ComputedRef<boolean>
  /** Lets the user pick a parameter file or a snapshot (the host's open dialog) and compares with it. */
  openFile: () => Promise<void>
  /** Compares with a parameter file or a snapshot, from its text. */
  loadText: (text: string) => void
  /** Reads the firmware's defaults from the vehicle and compares with them. */
  loadDefaults: () => Promise<void>
  /** Copies a row across, or not (one that can't be copied can't be picked). */
  toggle: (id: string) => void
  /** Changes which rows show. */
  setFilter: (change: Partial<CompareFilter>) => void
  /** Puts the rows copied across under review, ticked, and closes the comparison. */
  review: () => void
  /** Closes the comparison. */
  close: () => void
}

/**
 * Why the defaults could not be read, in words: a vehicle without file transfer is said plainly (it is not a failure to retry).
 *
 * @param error what the call threw
 * @returns the words
 */
function defaultsError(error: unknown): string {
  return toBackendError(error).code === 'UNSUPPORTED'
    ? say('compare.defaultsUnsupported')
    : say('compare.defaultsFailed', { error: describeError(error) })
}

/**
 * The review of the rows copied across: their changes, from the same source.
 *
 * @param side the other side
 * @param rows the rows copied across
 * @returns the review
 */
function reviewOf(side: CompareSide, rows: CompareRow[]): Review {
  const changes = rows.flatMap(row => (row.change ? [row.change] : []))

  return { source: side.source, changes, unchanged: 0, vehicleWarning: side.vehicleWarning, notes: [] }
}

/** The comparison. */
class Compare implements CompareModel {
  readonly side = shallowRef<CompareSide | null>(null)
  readonly error = shallowRef<string | null>(null)
  readonly loading = shallowRef(false)
  readonly picked = shallowRef<string[]>([])
  readonly filter = shallowRef<CompareFilter>(ALL_DIFFERENCES)
  readonly rows = computed(() => this.rowsNow())
  readonly open = computed(() => this.side.value !== null || this.error.value !== null || this.loading.value)

  /**
   * Makes the comparison.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: CompareDeps) {}

  /**
   * The rows, against the vehicle's parameters now.
   *
   * @returns the rows, or none when nothing is loaded
   */
  private rowsNow(): CompareRow[] {
    const side = this.side.value
    const metadata = this.deps.metadata()

    return side ? compareValues(side.wanted, this.deps.params.value, metadata.size > 0 ? { metadata } : {}) : []
  }

  /**
   * Shows a new other side (or why there is none), with nothing copied and every difference shown.
   *
   * @param side the side, or why it could not be loaded
   */
  private showSide(side: CompareSide | string): void {
    this.picked.value = []
    this.filter.value = ALL_DIFFERENCES
    this.side.value = typeof side === 'string' ? null : side
    this.error.value = typeof side === 'string' ? side : null
  }

  async openFile(): Promise<void> {
    try {
      const { text } = await this.deps.client.call('files.openParams', null)
      if (text !== undefined) {
        this.loadText(text)
      }
    } catch (error) {
      this.showSide(say('notice.open', { error: describeError(error) }))
    }
  }

  loadText(text: string): void {
    const side = sideOfText(text, this.deps.connection.value.vehicle)

    this.showSide(typeof side === 'string' ? say('notice.snapshotLoad', { reason: side }) : side)
  }

  async loadDefaults(): Promise<void> {
    if (this.loading.value) {
      return
    }
    this.loading.value = true

    try {
      const { defaults } = await this.deps.client.call('params.defaults', null)
      this.showSide(defaultsSide(defaults))
    } catch (error) {
      this.showSide(defaultsError(error))
    } finally {
      this.loading.value = false
    }
  }

  toggle(id: string): void {
    const row = this.rows.value.find(candidate => candidate.id === id)
    if (!row || !copyable(row)) {
      return
    }
    const picked = this.picked.value

    this.picked.value = picked.includes(id) ? picked.filter(other => other !== id) : [...picked, id]
  }

  setFilter(change: Partial<CompareFilter>): void {
    this.filter.value = { ...this.filter.value, ...change }
  }

  review(): void {
    const side = this.side.value
    const rows = this.rows.value.filter(row => this.picked.value.includes(row.id) && copyable(row))
    if (!side || rows.length === 0) {
      return
    }
    this.deps.snapshots.show(reviewOf(side, rows), rows.map(row => row.id))
    this.close()
  }

  close(): void {
    this.side.value = null
    this.error.value = null
    this.picked.value = []
    this.filter.value = ALL_DIFFERENCES
  }
}

/**
 * Makes the comparison.
 *
 * @param deps the client and the rest of the interface
 * @returns the refs and the actions
 */
export function useCompare(deps: CompareDeps): CompareModel {
  return new Compare(deps)
}
