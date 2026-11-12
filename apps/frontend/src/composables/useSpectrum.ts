// The Spectrum screen's model: a log on this computer is read, the raw IMU batches it holds are listed, and the amplitude
// spectrum
// of one sensor is asked for. The backend (`logs.local.read`, `.batches`, `.spectrum`) does one pass over the file for each, so
// they are asked one after the other, with progress and a way to stop. A log with no batch says so (the page then says how to
// capture one), and a spectrum is only ever what the log holds: an error or an empty answer is not drawn as a measurement.
import { type Ref, type ShallowRef, ref, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import type { BatchSource, LocalLogSpectrum, LocalLogSummary } from '@/generated/app'
import { asNumber } from '@/lib/logs/localLogs'

/** What the model needs. */
export interface SpectrumDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** How far the screen has got. */
export type SpectrumPhase = 'idle' | 'reading' | 'listing' | 'computing' | 'ready' | 'none' | 'failed'

/** The Spectrum model. */
export interface SpectrumModel {
  /** The key of the log that is open, or null. */
  readonly open: Readonly<Ref<string | null>>
  /** How far it has got. */
  readonly phase: Readonly<Ref<SpectrumPhase>>
  /** How far the read is, or null when it is not reading. */
  readonly progress: ShallowRef<{ bytes: number, total: number } | null>
  /** What the read found of the log (its firmware, length). */
  readonly summary: ShallowRef<LocalLogSummary | null>
  /** The sensors the log has batches of. */
  readonly sources: ShallowRef<BatchSource[]>
  /** The sensor whose spectrum is shown or asked for, as `gyro:0`. */
  readonly chosen: Readonly<Ref<string | null>>
  /** The spectrum of the chosen sensor. */
  readonly spectrum: ShallowRef<LocalLogSpectrum | null>
  /** Whether the last log that was being opened was stopped. */
  readonly stopped: Readonly<Ref<boolean>>
  /** What the last call that failed said. */
  readonly error: ShallowRef<string | null>
  /** Opens a log: reads it, lists its batches, and makes the spectrum of the first gyro (else the first sensor). */
  choose: (key: string) => Promise<void>
  /** Makes the spectrum of another sensor of the open log. */
  pick: (source: BatchSource) => Promise<void>
  /** Stops the pass that is under way. */
  cancel: () => Promise<void>
  /** Closes the log. */
  close: () => void
}

/**
 * The identity of a source, as the screen's choice.
 *
 * @param source the sensor
 * @returns `gyro:0`
 */
export function idOf(source: Pick<BatchSource, 'sensor' | 'instance'>): string {
  return `${source.sensor}:${source.instance}`
}

/**
 * The sensor to show first: the gyro with the lowest instance (the notch is set from the gyro), else the first there is.
 *
 * @param sources the sensors of the log
 * @returns the sensor, or undefined when there is none
 */
export function firstOf(sources: readonly BatchSource[]): BatchSource | undefined {
  const gyros = sources.filter(source => source.sensor === 'gyro').sort((a, b) => a.instance - b.instance)

  return gyros[0] ?? sources[0]
}

/** The Spectrum model. */
class Spectrum implements SpectrumModel {
  readonly open = ref<string | null>(null)
  readonly phase = ref<SpectrumPhase>('idle')
  readonly progress = shallowRef<{ bytes: number, total: number } | null>(null)
  readonly summary = shallowRef<LocalLogSummary | null>(null)
  readonly sources = shallowRef<BatchSource[]>([])
  readonly chosen = ref<string | null>(null)
  readonly spectrum = shallowRef<LocalLogSpectrum | null>(null)
  readonly stopped = ref(false)
  readonly error = shallowRef<string | null>(null)

  /**
   * Makes the model, and listens to the progress of passes.
   *
   * @param deps the client
   */
  constructor(private readonly deps: SpectrumDeps) {
    deps.client.onEvent('logs.local.progress', progress => {
      if (progress.key === this.open.value && ['reading', 'listing', 'computing'].includes(this.phase.value)) {
        this.progress.value = { bytes: asNumber(progress.bytes), total: asNumber(progress.total) }
      }
    })
  }

  async choose(key: string): Promise<void> {
    if (['reading', 'listing', 'computing'].includes(this.phase.value)) {
      return
    }
    this.close()
    this.stopped.value = false
    this.open.value = key
    this.phase.value = 'reading'

    try {
      this.summary.value = await this.deps.client.call('logs.local.read', { key })
      await this.list(key)
    } catch (error) {
      this.failed(key, error)
    }
  }

  /**
   * Lists the batches of the log that was read, and makes the first spectrum.
   *
   * @param key the log
   */
  private async list(key: string): Promise<void> {
    this.phase.value = 'listing'
    const { sources } = await this.deps.client.call('logs.local.batches', { key })
    if (this.open.value !== key) {
      return
    }
    this.sources.value = sources
    const first = firstOf(sources)
    if (first === undefined) {
      this.phase.value = 'none'
      this.progress.value = null

      return
    }
    await this.compute(key, first)
  }

  /**
   * Makes the spectrum of a sensor.
   *
   * @param key the log
   * @param source the sensor
   */
  private async compute(key: string, source: BatchSource): Promise<void> {
    this.phase.value = 'computing'
    this.chosen.value = idOf(source)
    this.spectrum.value = null
    const spectrum = await this.deps.client.call('logs.local.spectrum', { key, sensor: source.sensor, instance: source.instance })
    if (this.open.value === key && this.chosen.value === idOf(source)) {
      this.spectrum.value = spectrum
      this.phase.value = 'ready'
      this.progress.value = null
    }
  }

  async pick(source: BatchSource): Promise<void> {
    const key = this.open.value
    if (key === null || ['reading', 'listing', 'computing'].includes(this.phase.value)) {
      return
    }
    try {
      await this.compute(key, source)
    } catch (error) {
      this.failed(key, error)
    }
  }

  /**
   * A call for the open log failed: stopping it by hand is not an error, anything else is shown.
   *
   * @param key the log it was for
   * @param error what it threw
   */
  private failed(key: string, error: unknown): void {
    if (this.open.value !== key) {
      return
    }
    this.progress.value = null

    if (toBackendError(error).code === 'ABORTED') {
      this.close()
      this.stopped.value = true

      return
    }
    this.phase.value = 'failed'
    this.spectrum.value = null
    this.error.value = describeError(error)
  }

  async cancel(): Promise<void> {
    try {
      await this.deps.client.call('logs.local.cancel', null)
    } catch (error) {
      this.error.value = describeError(error)
    }
  }

  close(): void {
    this.open.value = null
    this.phase.value = 'idle'
    this.progress.value = null
    this.summary.value = null
    this.sources.value = []
    this.chosen.value = null
    this.spectrum.value = null
    this.error.value = null
  }
}

/**
 * The Spectrum model.
 *
 * @param deps the client
 * @returns the model
 */
export function useSpectrum(deps: SpectrumDeps): SpectrumModel {
  return new Spectrum(deps)
}
