// The housekeeping of the logs on this computer: the backend removes downloaded copies by the user's preferences (a retention in
// days, a cap on the room), and this asks it to, at the start and after each download, and says what it removed: a toast that
// names the logs, and the last result for the page of the vehicle's logs. It never asks while one is going on; a refusal because
// the vehicle is armed (or not known to be disarmed) or because a download runs is not an error: the next time it asks again.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import type { LogsHousekept, RemovedLog } from '@/generated/app'
import { say } from '@/i18n/say'
import type { ToastInput } from './toasts'

/** What the housekeeping needs. */
export interface HousekeepingDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The preferences now: days (0 = never), megabytes (0 = no limit). */
  prefs: () => { retentionDays: number, sizeCapMb: number }
  /** Tells the user something (a toast). */
  tell: (input: ToastInput) => void
}

/** The housekeeping, as refs and an action. */
export interface HousekeepingModel {
  /** What the last run did, or null before one. */
  readonly last: ShallowRef<LogsHousekept | null>
  /** Asks the backend to remove what the preferences say; says what it removed. */
  run: () => Promise<void>
}

/** The errors that only mean "not now": the vehicle may be flying, or a download runs. */
const NOT_NOW = ['ARMED', 'STATE_UNKNOWN', 'BUSY']

/** How many removed logs a toast names (the rest are counted). */
const NAMED = 5

/**
 * The number of a log, from the name of its copy (`00000012-1a2b3c4d.BIN` is log 12).
 *
 * @param name the name of the copy
 * @returns the number, as the vehicle writes it
 */
export function numberOf(name: string): string {
  return String(Number.parseInt(name.slice(0, 8), 10))
}

/**
 * What a run removed, in words that name the logs and say why.
 *
 * @param done what the backend answered
 * @param retentionDays the retention asked for
 * @param sizeCapMb the cap asked for
 * @returns the sentence
 */
export function removedText(done: LogsHousekept, retentionDays: number, sizeCapMb: number): string {
  const shown = done.removed.slice(0, NAMED).map((log: RemovedLog) => numberOf(log.name)).join(', ')
  const more = done.removedCount - Math.min(NAMED, done.removed.length)
  const names = more > 0 ? say('housekeeping.namesMore', { names: shown, count: more }) : shown
  const byAge = done.removed.filter(log => log.why === 'age').length
  const reason = byAge === done.removed.length
    ? say('housekeeping.why.age', { days: retentionDays })
    : say(byAge === 0 ? 'housekeeping.why.size' : 'housekeeping.why.both', { days: retentionDays, megabytes: sizeCapMb })

  return say('housekeeping.removed', { count: done.removedCount, names, reason }, done.removedCount)
}

/** The housekeeping. */
class Housekeeping implements HousekeepingModel {
  readonly last = shallowRef<LogsHousekept | null>(null)
  private running = false

  /**
   * Makes the housekeeping.
   *
   * @param deps the client, the preferences and the way to tell the user
   */
  constructor(private readonly deps: HousekeepingDeps) {}

  async run(): Promise<void> {
    if (this.running) {
      return
    }
    this.running = true
    const { retentionDays, sizeCapMb } = this.deps.prefs()
    try {
      const done = await this.deps.client.call('logs.housekeeping', { retentionDays, sizeCapMb })
      this.last.value = done

      if (done.removedCount > 0) {
        this.deps.tell({ id: 'housekeeping', severity: 'info', text: removedText(done, retentionDays, sizeCapMb), long: true })
      }
    } catch (error) {
      this.failed(error)
    } finally {
      this.running = false
    }
  }

  /**
   * A run failed: "not now" is quiet (it asks again next time), a backend that does not know the method is quiet too, anything
   * else is told once.
   *
   * @param error what it threw
   */
  private failed(error: unknown): void {
    const { code } = toBackendError(error)
    if (NOT_NOW.includes(code) || code === 'UNKNOWN_METHOD') {
      return
    }
    const text = say('housekeeping.failed', { error: describeError(error) })
    this.deps.tell({ id: 'housekeeping-failed', severity: 'warning', text })
  }
}

/**
 * The housekeeping of the logs on this computer.
 *
 * @param deps the client, the preferences and the way to tell the user
 * @returns the model
 */
export function useHousekeeping(deps: HousekeepingDeps): HousekeepingModel {
  return new Housekeeping(deps)
}
