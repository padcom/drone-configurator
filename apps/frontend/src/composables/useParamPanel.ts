// A Setup page's view of some parameters: the values it shows (what the vehicle has, or what the user has chosen here and has not
// written), which of them differ, and one write for all of them through the staged changes (one question that names every
// parameter, each read back, the first that is not confirmed stops the rest). The page declares the parameters it writes;
// nothing else is written from it. A Setup write is GUARDED: it is refused while the vehicle is armed, or may be (unknown counts
// as armed), by the queue here and by the backend, and the panel says why instead of failing.
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
import { armedOf } from '@/lib/app/armed'
import type { ConfiguratorHandle } from './useConfigurator'

/** Why the panel cannot be written now, or null. */
export type PanelBlock = 'offline' | 'loading' | 'armed' | 'unknown' | null

/** How the last write went: nothing yet, all written and read back, or a failure (with the words in `detail`). */
export type PanelState = 'idle' | 'written' | 'failed'

/** A page's parameters. */
export interface ParamPanel {
  /** The parameters the page writes, in the order it lists them. */
  readonly ids: readonly string[]
  /** The value shown for a parameter: the user's choice, else the vehicle's; null when it is not on the vehicle. */
  value: (id: string) => number | null
  /** The vehicle's value, or null when it is not on the vehicle. */
  vehicleValue: (id: string) => number | null
  /** Chooses a value for a parameter (nothing is sent). */
  set: (id: string, value: number) => void
  /** The parameters of the page that are not on this vehicle (they are left out of the write). */
  readonly missing: ComputedRef<string[]>
  /** The parameters whose chosen value differs from the vehicle's. */
  readonly dirty: ComputedRef<string[]>
  /** Why nothing can be written now. */
  readonly blocked: ComputedRef<PanelBlock>
  /** How the last write went. */
  readonly state: ShallowRef<PanelState>
  /** What a failed write says, in words. */
  readonly detail: ShallowRef<string>
  /** Whether a write is under way. */
  readonly writing: ComputedRef<boolean>
  /** Writes what differs, after the one question. */
  write: () => Promise<void>
  /** Puts back what the vehicle has: the choices are forgotten, and what was queued from here is taken out. */
  revert: () => void
}

/**
 * Why a page's parameters cannot be written now: no vehicle, the list still coming, or the armed state.
 *
 * @param connected whether a vehicle is connected
 * @param list how the parameter list stands
 * @returns the reason, or null when only the armed state is left to look at
 */
function listBlock(connected: boolean, list: string): PanelBlock {
  if (!connected) {
    return 'offline'
  }

  return list === 'loading' || list === 'none' ? 'loading' : null
}

/**
 * The block that the armed state makes.
 *
 * @param armed whether the vehicle is armed; undefined when that is not known (it counts as armed)
 * @returns the reason, or null
 */
function armedBlock(armed: boolean | undefined): PanelBlock {
  if (armed === undefined) {
    return 'unknown'
  }

  return armed ? 'armed' : null
}

/** The parameters of a page. */
class Panel implements ParamPanel {
  readonly state = shallowRef<PanelState>('idle')
  readonly detail = shallowRef('')
  readonly missing: ComputedRef<string[]>
  readonly dirty: ComputedRef<string[]>
  readonly blocked: ComputedRef<PanelBlock>
  readonly writing: ComputedRef<boolean>
  private readonly chosen = shallowRef<Record<string, number>>({})
  private readonly byId: ComputedRef<Map<string, number>>

  /**
   * Makes the panel.
   *
   * @param ids the parameters the page writes
   * @param handle the parameters, the queue, the connection and the telemetry
   */
  constructor(readonly ids: readonly string[], private readonly handle: ConfiguratorHandle) {
    const { parameters, staged, fields } = handle
    this.byId = computed(() => new Map(parameters.params.value.map(param => [param.id, param.value])))
    this.missing = computed(() => ids.filter(id => !this.byId.value.has(id)))
    this.dirty = computed(() => ids.filter(id => this.isDirty(id)))
    this.blocked = computed(() => {
      const connected = fields.connection.value.state === 'connected'

      return listBlock(connected, parameters.list.value) ?? armedBlock(armedOf(fields.telemetry.value))
    })
    this.writing = computed(() => staged.writing.value || parameters.lock.busy.value)
  }

  /**
   * Whether the user's choice for a parameter differs from the vehicle's.
   *
   * @param id the parameter
   * @returns true if it does
   */
  private isDirty(id: string): boolean {
    return id in this.chosen.value && this.byId.value.has(id) && this.chosen.value[id] !== this.vehicleValue(id)
  }

  vehicleValue = (id: string): number | null => this.byId.value.get(id) ?? null

  value = (id: string): number | null => this.chosen.value[id] ?? this.vehicleValue(id)

  set = (id: string, value: number): void => {
    this.chosen.value = { ...this.chosen.value, [id]: value }
    this.state.value = 'idle'
  }

  /** Takes the outcome of a write: what was not read back is told, in words. */
  private settle(): void {
    const { staged } = this.handle
    const left = this.ids.filter(id => staged.pending().some(change => change.id === id))
    if (left.length === 0) {
      this.chosen.value = {}
      this.state.value = 'written'
      this.detail.value = ''

      return
    }
    const failures = staged.results.value.filter(result => left.includes(result.id))
    this.state.value = failures.length > 0 ? 'failed' : 'idle'
    this.detail.value = failures.map(result => `${result.id}: ${result.detail}`).join('; ')
  }

  /**
   * Whether a write may begin now.
   *
   * @returns true when something differs, nothing blocks it, and no write is under way
   */
  private writable(): boolean {
    return this.blocked.value === null && this.dirty.value.length > 0 && !this.writing.value
  }

  write = async (): Promise<void> => {
    if (!this.writable()) {
      return
    }
    const { staged } = this.handle
    this.state.value = 'idle'
    this.detail.value = ''
    staged.stage(this.dirty.value.map(id => ({ id, to: this.value(id) ?? 0 })), { guarded: true })

    if (staged.refused.value !== null) {
      this.state.value = 'failed'
      this.detail.value = staged.refused.value

      return
    }
    await staged.writeAll()
    this.settle()
  }

  revert = (): void => {
    this.chosen.value = {}
    this.state.value = 'idle'
    this.detail.value = ''
    this.ids.forEach(id => this.handle.staged.discard(id))
  }
}

/**
 * The parameters of a page.
 *
 * @param ids the parameters the page writes
 * @param handle the parameters, the queue, the connection and the telemetry
 * @returns the panel
 */
export function useParamPanel(ids: readonly string[], handle: ConfiguratorHandle): ParamPanel {
  return new Panel(ids, handle)
}
