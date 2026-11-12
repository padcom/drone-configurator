// The Logging setup page: what the vehicle has for the logging parameters, what the user has ticked, and the changes that make
// the one the other. A tick changes nothing on the vehicle: "Add to the changes" queues the new values in the same list as every
// other parameter change, and they are written from there, after one question, each read back. Not while the vehicle is armed
// (or may be: an unknown state counts as armed).
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
import type { LocalLog, Param } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import {
  BATCH_COUNT,
  BATCH_INTERVAL,
  BATCH_MASK,
  BATCH_OPT,
  LOG_BITMASK,
  type BitRow,
  batchBytesPerMinute,
  bitsOf,
  isMask,
  measuredBytesPerMinute,
  measuredOf,
  streamRows,
  withBit,
} from '@/lib/logs/loggingSetup'
import type { Metadata } from '@/lib/params/metadata'
import type { Telemetry } from '@/generated/app'

/** What the page needs from the rest of the interface. */
export interface LoggingDeps {
  /** The parameters on the vehicle. */
  params: () => Param[]
  /** The loaded metadata (the names of the bits). */
  metadata: () => Metadata
  /** The latest telemetry (whether the vehicle is armed). */
  telemetry: () => Telemetry | null
  /** The logs on this computer (the rate of the newest verified one is the measured part of the estimate). */
  logs: () => LocalLog[]
  /** Queues new values; how many are queued now. */
  stage: (targets: { id: string, to: number }[]) => number
}

/** A change the ticks make: the parameter, its value on the vehicle, and the value wanted. */
export interface WantedChange {
  /** The parameter. */
  id: string
  /** Its value on the vehicle. */
  from: number
  /** The value wanted. */
  to: number
}

/** The size the page estimates, in bytes a minute, with what it rests on. */
export interface Estimate {
  /** The newest verified log's own rate, or null when the library has no log with a length. */
  measured: number | null
  /** The most the batch sampling writes with the values now wanted. */
  batch: number
  /** The most it wrote with the values on the vehicle. */
  batchNow: number
}

/** The parameters of the page that are bitmasks. */
const MASKS: readonly string[] = [LOG_BITMASK, BATCH_MASK, BATCH_OPT]

/** The Logging setup model. */
export interface LoggingModel {
  /** Whether the vehicle has the logging parameters at all. */
  readonly available: ComputedRef<boolean>
  /** Whether the vehicle is armed or may be: nothing is queued then. */
  readonly armed: ComputedRef<boolean>
  /** Whether the masks are int32 (they are, unless the vehicle sent a number that cannot be a mask): else no bit is editable. */
  readonly editable: ComputedRef<boolean>
  /** The bits of the log bitmask listed, with whether each is ticked. */
  readonly streams: ComputedRef<(BitRow & { on: boolean })[]>
  /** Which IMUs the batch sampling logs (the bits of its mask), ticked or not. */
  readonly imus: ComputedRef<{ bit: number, on: boolean, name: string | null }[]>
  /** The batch options and whether each is ticked. */
  readonly options: ComputedRef<{ bit: number, on: boolean, name: string | null }[]>
  /** What the ticks change on the vehicle. */
  readonly changes: ComputedRef<WantedChange[]>
  /** The estimate. */
  readonly estimate: ComputedRef<Estimate>
  /** Whether the metadata names the bits of the log bitmask. */
  readonly named: ComputedRef<boolean>
  /** Ticks or unticks a bit of a parameter. */
  set: (id: string, bit: number, on: boolean) => void
  /** Puts the ticks back to what the vehicle has. */
  revert: () => void
  /** Queues the changes (not while armed): how many are queued. */
  queue: () => number
}

/** The model. */
class Logging implements LoggingModel {
  private readonly wanted: ShallowRef<Record<string, number>> = shallowRef({})
  readonly available: ComputedRef<boolean>
  readonly armed: ComputedRef<boolean>
  readonly editable: ComputedRef<boolean>
  readonly streams: LoggingModel['streams']
  readonly imus: LoggingModel['imus']
  readonly options: LoggingModel['options']
  readonly changes: ComputedRef<WantedChange[]>
  readonly estimate: ComputedRef<Estimate>
  readonly named: ComputedRef<boolean>

  /**
   * Makes the model.
   *
   * @param deps the rest of the interface
   */
  constructor(private readonly deps: LoggingDeps) {
    this.available = computed(() => this.has(LOG_BITMASK))
    this.armed = computed(() => armedOf(deps.telemetry()) !== false)
    this.editable = computed(() => MASKS.every(id => !this.has(id) || isMask(this.vehicleValue(id))))
    this.named = computed(() => Object.keys(deps.metadata().get(LOG_BITMASK)?.bits ?? {}).length > 0)
    this.streams = computed(() => streamRows(deps.metadata(), this.vehicleValue(LOG_BITMASK))
      .map(row => ({ ...row, on: bitsOf(this.value(LOG_BITMASK)).includes(row.bit) })))
    this.imus = computed(() => this.bitList(BATCH_MASK, [0, 1, 2]))
    this.options = computed(() => this.bitList(BATCH_OPT, [0, 1, 2]))
    this.changes = computed(() => this.wantedChanges())
    this.estimate = computed(() => this.estimated())
  }

  /**
   * Whether the vehicle has a parameter.
   *
   * @param id the parameter
   * @returns true if it is in the list
   */
  private has(id: string): boolean {
    return this.deps.params().some(param => param.id === id)
  }

  /**
   * A parameter's value on the vehicle (0 when it has none).
   *
   * @param id the parameter
   * @returns the value
   */
  private vehicleValue(id: string): number {
    return this.deps.params().find(param => param.id === id)?.value ?? 0
  }

  /**
   * A parameter's value as ticked now: what the user wants, else what the vehicle has.
   *
   * @param id the parameter
   * @returns the value
   */
  private value(id: string): number {
    return this.wanted.value[id] ?? this.vehicleValue(id)
  }

  /**
   * The bits of a parameter to list, with the names the metadata gives.
   *
   * @param id the parameter
   * @param bits the positions
   * @returns the rows
   */
  private bitList(id: string, bits: number[]): { bit: number, on: boolean, name: string | null }[] {
    const names = this.deps.metadata().get(id)?.bits ?? {}

    return bits.map(bit => ({ bit, on: bitsOf(this.value(id)).includes(bit), name: names[String(bit)] ?? null }))
  }

  /**
   * The changes the ticks make.
   *
   * @returns the parameters whose wanted value differs from the vehicle's
   */
  private wantedChanges(): WantedChange[] {
    return Object.entries(this.wanted.value)
      .map(([id, to]) => ({ id, from: this.vehicleValue(id), to }))
      .filter(change => change.from !== change.to && this.has(change.id))
  }

  /**
   * The estimate with the values wanted and with those on the vehicle.
   *
   * @returns the estimate
   */
  private estimated(): Estimate {
    const setting = (read: (id: string) => number) => ({
      mask: read(BATCH_MASK),
      intervalMs: this.has(BATCH_INTERVAL) ? read(BATCH_INTERVAL) : 20,
      count: this.has(BATCH_COUNT) ? read(BATCH_COUNT) : 1024,
    })

    return {
      measured: measuredBytesPerMinute(measuredOf(this.deps.logs())),
      batch: batchBytesPerMinute(setting(id => this.value(id))),
      batchNow: batchBytesPerMinute(setting(id => this.vehicleValue(id))),
    }
  }

  set(id: string, bit: number, on: boolean): void {
    if (this.has(id) && this.editable.value) {
      this.wanted.value = { ...this.wanted.value, [id]: withBit(this.value(id), bit, on) }
    }
  }

  revert(): void {
    this.wanted.value = {}
  }

  queue(): number {
    if (this.armed.value || !this.editable.value || this.changes.value.length === 0) {
      return 0
    }
    const queued = this.deps.stage(this.changes.value.map(({ id, to }) => ({ id, to })))
    this.wanted.value = {}

    return queued
  }
}

/**
 * The Logging setup model.
 *
 * @param deps the rest of the interface
 * @returns the model
 */
export function useLoggingSetup(deps: LoggingDeps): LoggingModel {
  return new Logging(deps)
}
