// A Setup page's view of some parameters: the values it shows (what the vehicle has, or what the user has chosen here and has not
// written), which of them differ, and one write for all of them through the staged changes (one question that names every
// parameter, each read back, the first that is not confirmed stops the rest). The page declares the parameters it writes;
// nothing else is written from it. A Setup write is GUARDED: it is refused while the vehicle is armed, or may be (unknown counts
// as armed), by the queue here and by the backend, and the panel says why instead of failing.
import { type ComputedRef, type ShallowRef, computed, shallowRef, watch } from 'vue'
import { armedOf } from '@/lib/app/armed'
import { type ValueType, canonical } from '@/lib/params/paramValue'
import type { ConfiguratorHandle } from './useConfigurator'

/** Why the panel cannot be written now, or null. */
export type PanelBlock = 'offline' | 'loading' | 'armed' | 'unknown' | null

/** How the last write went: nothing yet, all written and read back, or a failure (with the words in `detail`). */
export type PanelState = 'idle' | 'written' | 'failed'

/** What a write did, parameter by parameter (never a silent partial state): which were read back, which not, which unwritten. */
export interface PanelOutcome {
  /** The parameters the vehicle read back with the new value. */
  confirmed: string[]
  /** The ones that were written and not confirmed (the vehicle reported another value, or the write failed), with the reason. */
  notConfirmed: { id: string, detail: string }[]
  /** The ones that were not written at all: the write stopped at the first that was not confirmed. */
  notWritten: string[]
}

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
  /** The parameters the last write wrote and read back (for a "reboot needed"); forgotten when the link goes. */
  readonly written: ShallowRef<string[]>
  /**
   * What the vehicle had for each of them before the first write that has not been rebooted for yet: what a change took effect
   * from (a serial port's protocol before it was changed), for as long as `written` lives.
   */
  readonly writtenWas: ShallowRef<Record<string, number>>
  /** Whether a write is under way. */
  readonly writing: ComputedRef<boolean>
  /** Whether the vehicle is armed (known to be: a vehicle whose state is not known is blocked, not armed). */
  readonly armed: ComputedRef<boolean>
  /** What the last write did, parameter by parameter; null before any, and when the changes were refused before a write. */
  readonly outcome: ShallowRef<PanelOutcome | null>
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
 * @param tuning whether it is the Tune screen's panel (armed is no block there)
 * @returns the reason, or null
 */
function armedBlock(armed: boolean | undefined, tuning: boolean): PanelBlock {
  if (armed === undefined) {
    return 'unknown'
  }

  // The Tune screen is for a vehicle in flight too (the leader's decision Q7): armed blocks nothing there, only a state that is
  // not known.
  return armed && !tuning ? 'armed' : null
}

/**
 * What a write did, parameter by parameter.
 *
 * @param sent the parameters that were sent, in the order they were written
 * @param left the ones that are still queued (not read back)
 * @param results how each change that was written and not confirmed went
 * @returns which were confirmed, which were written and not confirmed (and why), and which were never written
 */
function outcomeOf(sent: string[], left: string[], results: { id: string, detail: string }[]): PanelOutcome {
  const notConfirmed = results.filter(result => left.includes(result.id)).map(({ id, detail }) => ({ id, detail }))

  return {
    confirmed: sent.filter(id => !left.includes(id)),
    notConfirmed,
    notWritten: left.filter(id => !notConfirmed.some(result => result.id === id)),
  }
}

/** The parameters of a page. */
class Panel implements ParamPanel {
  readonly state = shallowRef<PanelState>('idle')
  readonly detail = shallowRef('')
  readonly written = shallowRef<string[]>([])
  readonly writtenWas = shallowRef<Record<string, number>>({})
  readonly missing: ComputedRef<string[]>
  readonly dirty: ComputedRef<string[]>
  readonly blocked: ComputedRef<PanelBlock>
  readonly writing: ComputedRef<boolean>
  readonly armed: ComputedRef<boolean>
  readonly outcome = shallowRef<PanelOutcome | null>(null)
  private readonly chosen = shallowRef<Record<string, number>>({})
  private readonly byId: ComputedRef<Map<string, number>>
  private readonly typeById: ComputedRef<Map<string, ValueType>>

  /**
   * Makes the panel.
   *
   * @param ids the parameters the page writes
   * @param handle the parameters, the queue, the connection and the telemetry
   * @param tuning whether it is the Tune screen's panel (armed is no block there: its changes are written after a hold)
   */
  constructor(readonly ids: readonly string[], private readonly handle: ConfiguratorHandle, private readonly tuning = false) {
    const { parameters, staged, fields } = handle
    this.byId = computed(() => new Map(parameters.params.value.map(param => [param.id, param.value])))
    this.typeById = computed(() => new Map(parameters.params.value.map(param => [param.id, param])))
    this.missing = computed(() => ids.filter(id => !this.byId.value.has(id)))
    this.dirty = computed(() => ids.filter(id => this.isDirty(id)))
    this.blocked = computed(() => {
      const connected = fields.connection.value.state === 'connected'

      return listBlock(connected, parameters.list.value) ?? armedBlock(armedOf(fields.telemetry.value), tuning)
    })
    this.armed = computed(() => armedOf(fields.telemetry.value) === true)
    this.writing = computed(() => staged.writing.value || parameters.lock.busy.value)
    // What was written needs a reboot to take effect: that is said until the link goes (the vehicle rebooted, or was
    // disconnected).
    watch(() => fields.connection.value.state, state => {
      if (state !== 'connected') {
        this.written.value = []
        this.writtenWas.value = {}
      }
    })
  }

  /**
   * Whether the user's choice for a parameter differs from the vehicle's.
   *
   * @param id the parameter
   * @returns true if it does
   */
  private isDirty(id: string): boolean {
    const chosen = this.chosen.value[id]
    const vehicle = this.vehicleValue(id)

    return chosen !== undefined && vehicle !== null && this.canon(id, chosen) !== this.canon(id, vehicle)
  }

  /**
   * A value as the vehicle holds it (a REAL32 is the float nearest to it: a typed 0.18 is the vehicle's 0.18000000298), so that
   * what is typed is compared with what the vehicle has as the same kind of number.
   *
   * @param id the parameter
   * @param value the value
   * @returns the number the vehicle would hold
   */
  private canon(id: string, value: number): number {
    const type = this.typeById.value.get(id)

    return type === undefined ? value : canonical(type, value)
  }

  vehicleValue = (id: string): number | null => this.byId.value.get(id) ?? null

  value = (id: string): number | null => this.chosen.value[id] ?? this.vehicleValue(id)

  set = (id: string, value: number): void => {
    this.chosen.value = { ...this.chosen.value, [id]: value }
    this.state.value = 'idle'
  }

  /**
   * Takes the outcome of a write: what was not read back is told, in words.
   *
   * @param sent the parameters that were sent
   * @param was what the vehicle had for each of them before
   */
  private settle(sent: string[], was: Record<string, number>): void {
    const { staged } = this.handle
    const left = sent.filter(id => staged.pending().some(change => change.id === id))
    this.outcome.value = outcomeOf(sent, left, staged.results.value)

    if (left.length === 0) {
      this.chosen.value = {}
      this.state.value = 'written'
      this.detail.value = ''
      // What was written before and not rebooted for yet stays, with what it was written over (the first value is in force).
      this.written.value = [...new Set([...this.written.value, ...sent])]
      this.writtenWas.value = { ...was, ...this.writtenWas.value }

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

  /**
   * Whether the queue refused: the page says why, and nothing is written.
   *
   * @param staged the queue
   * @returns true if it did
   */
  private refusedBy(staged: ConfiguratorHandle['staged']): boolean {
    if (staged.refused.value === null) {
      return false
    }
    this.state.value = 'failed'
    this.detail.value = staged.refused.value

    return true
  }

  write = async (): Promise<void> => {
    if (!this.writable()) {
      return
    }
    const { staged } = this.handle
    const sent = [...this.dirty.value]
    const was = Object.fromEntries(sent.map(id => [id, this.vehicleValue(id) ?? 0]))
    this.begin(sent)

    if (this.refusedBy(staged)) {
      return
    }
    await staged.writeAll()
    // The queue may refuse after the question (the vehicle armed, or lost its state, meanwhile): nothing was written.
    this.finish(sent, was)
  }

  /**
   * Starts a write: clears what the last one said, and queues the changes.
   *
   * @param sent the parameters
   */
  private begin(sent: string[]): void {
    this.state.value = 'idle'
    this.detail.value = ''
    this.outcome.value = null
    const how = this.tuning ? { tuning: true } : { guarded: true }

    this.handle.staged.stage(sent.map(id => ({ id, to: this.value(id) ?? 0 })), how)
  }

  /**
   * Ends a write: what it did is told, unless the queue refused after the question.
   *
   * @param sent the parameters
   * @param was the values they had
   */
  private finish(sent: string[], was: Record<string, number>): void {
    if (!this.refusedBy(this.handle.staged)) {
      this.settle(sent, was)
    }
  }

  revert = (): void => {
    this.chosen.value = {}
    this.state.value = 'idle'
    this.detail.value = ''
    this.outcome.value = null
    this.ids.forEach(id => this.handle.staged.discard(id))
  }
}

/**
 * The parameters of a page.
 *
 * @param ids the parameters the page writes
 * @param handle the parameters, the queue, the connection and the telemetry
 * @param options how it is used
 * @param options.tuning the Tune screen's panel, whose changes may be written while the vehicle is armed (after a hold)
 * @returns the panel
 */
export function useParamPanel(
  ids: readonly string[],
  handle: ConfiguratorHandle,
  options: { tuning?: boolean } = {},
): ParamPanel {
  return new Panel(ids, handle, options.tuning === true)
}
