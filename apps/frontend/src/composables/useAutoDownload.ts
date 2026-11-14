// The download of the newest log after landing, when the user chose it (off by default, for the disk's sake). When the vehicle
// goes from armed to disarmed, the log of the flight is still being written for a while: the list is read again every `pollMs`
// until the size of the newest log has stopped growing (bounded by `maxWaitMs`), and then that log is downloaded, and
// CRC-verified
// by the backend. It never runs while the vehicle is armed or not known to be disarmed, nor while the link is not `connected`
// (`reconnecting` is not), it stops at once when the vehicle arms, and it makes ONE attempt for each landing: what failed or was
// interrupted is told once and is not tried again by itself (a partial file is the backend's `.part`, which a download that the
// user starts goes on from; the app leaves no other).
import { type Ref, type ShallowRef, shallowRef, watch } from 'vue'
import type { Connection, Telemetry, VehicleLog } from '@/generated/app'
import { armedOf } from '@/lib/app/armed'
import { say } from '@/i18n/say'
import type { LogsModel } from './useVehicleLogs'
import type { ToastInput } from './toasts'

/** What the auto-download needs. */
export interface AutoDownloadDeps {
  /** The vehicle's logs. */
  logs: LogsModel
  /** The vehicle's connection. */
  connection: Readonly<Ref<Connection>>
  /** The vehicle's latest telemetry (the armed state is read from it). */
  telemetry: Readonly<Ref<Telemetry | null>>
  /** Whether the user chose to download after landing. */
  enabled: () => boolean
  /** Tells the user something (a toast). */
  tell: (input: ToastInput) => void
  /**
   * Whether the vehicle's armed state is not a flight's: a motor test makes the vehicle report itself armed, and disarmed again
   * when it
   * stops, and that is not a landing. While it says so, an armed state is not taken for the start of a flight.
   */
  quiet?: Readonly<Ref<boolean>>
  /** How often the size of the newest log is looked at (ms). */
  pollMs?: number
  /** How long the newest log is waited for to stop growing (ms). */
  maxWaitMs?: number
}

const POLL_MS = 2000
const MAX_WAIT_MS = 60000

/** The auto-download: the attempt that is under way, if any (for the tests to wait for). */
export interface AutoDownload {
  /** The attempt of the last landing, until it is over. */
  readonly attempt: ShallowRef<Promise<void> | null>
}

/**
 * The newest log of a list (the highest number).
 *
 * @param logs the logs
 * @returns the newest, or undefined for an empty list
 */
function newestOf(logs: VehicleLog[]): VehicleLog | undefined {
  return logs.reduce<VehicleLog | undefined>((best, log) => (best === undefined || log.id > best.id ? log : best), undefined)
}

/**
 * Whether the newest log has stopped growing: the same log with the same size as at the look before (an empty list has nothing
 * to wait for).
 *
 * @param before the newest log at the look before
 * @param now the newest log now
 * @returns true when it is steady
 */
function isSteady(before: VehicleLog | undefined, now: VehicleLog | undefined): boolean {
  return now === undefined || (before?.id === now.id && before.size === now.size)
}

/**
 * Waits `ms`.
 *
 * @param ms how long
 */
async function wait(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

/** The auto-download of one landing. */
class Landing {
  /** Set when the attempt must stop: the vehicle armed, or what is needed to go on is gone. */
  cancelled = false

  /**
   * Makes the attempt for one landing.
   *
   * @param deps what it needs
   */
  constructor(private readonly deps: AutoDownloadDeps) {}

  /**
   * Whether the attempt may go on: nothing stopped it, the link is up, the vehicle is known to be disarmed, and the user still
   * wants it.
   *
   * @returns true to go on
   */
  private mayGoOn(): boolean {
    const { connection, telemetry } = this.deps

    return !this.cancelled && connection.value.state === 'connected' && armedOf(telemetry.value) === false && this.deps.enabled()
  }

  /**
   * Waits `ms` in steps of at most 100 ms, so that a stop is noticed.
   *
   * @param ms how long
   */
  private async pause(ms: number): Promise<void> {
    if (ms <= 0 || this.cancelled) {
      return
    }
    await wait(Math.min(ms, 100))
    await this.pause(ms - 100)
  }

  /**
   * Whether to look again: the attempt may go on and there is time left (`go`), the time is up (`timeout`), or it was stopped.
   *
   * @param until when to give up (ms since 1970)
   * @returns what to do
   */
  private check(until: number): 'go' | 'timeout' | 'stopped' {
    if (!this.mayGoOn()) {
      return 'stopped'
    }

    return Date.now() >= until ? 'timeout' : 'go'
  }

  /**
   * Reads the list until the newest log has stopped growing.
   *
   * @param before the newest log at the look before
   * @param until when to give up (ms since 1970)
   * @returns the newest log; undefined when the attempt stopped or there is no log; `timeout` when it kept growing
   */
  private async settled(before: VehicleLog | undefined, until: number): Promise<VehicleLog | 'timeout' | undefined> {
    const state = this.check(until)
    if (state !== 'go') {
      return state === 'timeout' ? state : undefined
    }
    await this.deps.logs.refresh()
    const now = newestOf(this.deps.logs.logs.value)

    return isSteady(before, now) ? now : this.again(now, until)
  }

  /**
   * The newest log was still growing: waits, and looks again.
   *
   * @param now the newest log at the look that was just made
   * @param until when to give up (ms since 1970)
   * @returns what `settled` returns
   */
  private async again(now: VehicleLog | undefined, until: number): Promise<VehicleLog | 'timeout' | undefined> {
    await this.pause(this.deps.pollMs ?? POLL_MS)

    return this.settled(now, until)
  }

  /**
   * Downloads the newest log after landing and tells how it went, once.
   *
   * @returns when it is over
   */
  async run(): Promise<void> {
    const log = await this.settled(undefined, Date.now() + (this.deps.maxWaitMs ?? MAX_WAIT_MS))
    if (log === 'timeout') {
      this.deps.tell({ id: 'auto-download', severity: 'warning', text: say('autoDownload.notSettled') })
    } else if (log !== undefined) {
      await this.download(log)
    }
  }

  /**
   * Downloads one log, if it is still wanted and not downloaded yet, and tells how it went.
   *
   * @param log the newest log
   */
  private async download(log: VehicleLog): Promise<void> {
    if (!this.mayGoOn() || log.downloaded) {
      return
    }
    const { logs } = this.deps
    logs.clearSelection()
    logs.toggle(log.id)
    await logs.download()
    this.report(log.id)
  }

  /**
   * Tells how the download went: whole and verified, or not, with the reason. Once, and no more attempts.
   *
   * @param id the log
   */
  private report(id: number): void {
    const { logs, tell } = this.deps
    if (logs.logs.value.find(log => log.id === id)?.downloaded === true) {
      tell({ id: 'auto-download', severity: 'success', text: say('autoDownload.done', { id }) })
    } else {
      const why = logs.error.value ?? say('autoDownload.interrupted')
      tell({ id: 'auto-download', severity: 'warning', long: true, text: say('autoDownload.failed', { id, why }) })
    }
  }
}

/** Watches the vehicle's arming and makes the attempt of each landing. */
class Watcher {
  readonly attempt = shallowRef<Promise<void> | null>(null)
  private landing: Landing | null = null
  /** Whether the vehicle was known to be armed since the last landing (a moment of not knowing in between loses nothing). */
  private wasArmed = false

  /**
   * Makes the watcher.
   *
   * @param deps what the attempts need
   */
  constructor(private readonly deps: AutoDownloadDeps) {}

  /**
   * The armed state changed.
   *
   * @param armed what is known of it now (undefined when it is not)
   */
  changed(armed: boolean | undefined): void {
    if (armed === true) {
      this.armed()
    } else if (armed === false && this.wasArmed) {
      this.wasArmed = false
      this.land()
    }
  }

  /** The vehicle says it is armed: that is a flight, unless a motor test is under way (the vehicle arms its motors for it). */
  private armed(): void {
    if (this.deps.quiet?.value !== true) {
      this.wasArmed = true
      this.stop()
    }
  }

  /** The vehicle armed: the attempt stops (the backend stops a download by itself at the next heartbeat). */
  private stop(): void {
    if (this.landing !== null) {
      this.landing.cancelled = true
      void this.deps.logs.cancel()
    }
  }

  /** The vehicle landed: one attempt, when the user chose it and the link is up. */
  private land(): void {
    if (!this.deps.enabled() || this.deps.connection.value.state !== 'connected') {
      return
    }
    const mine = new Landing(this.deps)
    this.landing = mine
    this.attempt.value = this.finish(mine)
  }

  /**
   * Runs an attempt and forgets it when it is over.
   *
   * @param mine the attempt
   */
  private async finish(mine: Landing): Promise<void> {
    await mine.run()

    if (this.landing === mine) {
      this.landing = null
      this.attempt.value = null
    }
  }
}

/**
 * Downloads the newest log after the vehicle lands, if the user chose it.
 *
 * @param deps the logs, the connection, the telemetry and the preference
 * @returns the state of the attempt
 */
export function useAutoDownload(deps: AutoDownloadDeps): AutoDownload {
  const watcher = new Watcher(deps)
  // Immediately: a vehicle that is armed when the app looks is one that will land.
  watch(() => armedOf(deps.telemetry.value), armed => watcher.changed(armed), { immediate: true })

  return watcher
}
