// The flight logs of the mock vehicle (the draft of `logs.*` in packages/contracts/app.cddl): a list, a download that goes on
// from what an earlier try fetched, a cancel that keeps what was fetched, and an erase that takes only the logs that were
// downloaded. Like the backend will, it refuses to download or erase while the vehicle is armed (or not known to be disarmed)
// and while a download runs.
import type { Envelope } from '@pico-desktop/protocol'
import type { LogsProgress, VehicleLog } from '@/generated/app'

type Reply = (p: Envelope['p']) => void
type Fail = (code: string, message: string) => void

/** How the mock downloads, and what it has. */
export interface MockLogsOptions {
  /** How many progress events a log takes. */
  steps: number
  /** How far apart the events are (ms). */
  intervalMs: number
  /** The logs on the vehicle, when not the usual four. */
  logs?: VehicleLog[]
}

/** The logs a mock vehicle has, oldest first (the time is a day in 2026, milliseconds). */
export const MOCK_LOGS: VehicleLog[] = [
  { id: 1, size: 1_200_000, time: 1_783_000_000_000, downloaded: false },
  { id: 2, size: 48_000, time: 1_783_086_400_000, downloaded: false },
  { id: 3, size: 3_400_000, time: 1_783_172_800_000, downloaded: true },
  { id: 4, size: 760_000, downloaded: false },
]

/** A download that is under way: the logs still to fetch, the ones whole, and how to end it. */
interface Run {
  queue: number[]
  done: number[]
  timer: ReturnType<typeof setInterval>
  finish: (stopped: boolean) => void
  step: number
  /** Where the log being fetched began (bytes). */
  from: number
}

/**
 * Why a call is refused, if it is: the vehicle is not known to be disarmed, it is armed, or a download runs.
 *
 * @param armed the armed state; anything but a boolean when it is not known
 * @param running whether a download is under way
 * @returns the code and the message, or null
 */
function refusal(armed: unknown, running: boolean): [string, string] | null {
  if (typeof armed !== 'boolean') {
    return ['STATE_UNKNOWN', 'the vehicle\'s state is unknown (no heartbeat for 3 s)']
  }
  if (armed) {
    return ['ARMED', 'the vehicle is armed']
  }

  return running ? ['BUSY', 'a log download is under way'] : null
}

/** The logs of the mock vehicle. */
export class MockLogs {
  logs: VehicleLog[]
  /** How many bytes of each log an interrupted download fetched (a log that is whole is not in here). */
  readonly fetched = new Map<number, number>()
  run: Run | undefined

  /**
   * Makes the logs of a vehicle.
   *
   * @param send sends an event to the interface
   * @param options how the download goes, and which logs there are
   * @param armed the armed state as `vehicle.reboot` sees it: undefined or null when it is not known
   */
  constructor(
    private readonly send: (e: Omit<Envelope, 'v'>) => void,
    private readonly options: MockLogsOptions,
    private readonly armed: () => boolean | null | undefined,
  ) {
    this.logs = this.initial()
  }

  /** The vehicle went away: nothing is under way any more. */
  reset(): void {
    if (this.run) {
      clearInterval(this.run.timer)
      this.run = undefined
    }
    this.logs = this.initial()
    this.fetched.clear()
  }

  /**
   * Answers with the logs.
   *
   * @param ok sends the answer
   */
  list(ok: Reply): void {
    ok({ logs: this.logs.map(log => ({ ...log })), source: 'ftp' })
  }

  /**
   * Starts fetching the logs asked for, one after the other; answers when they are whole, or when it is cancelled.
   *
   * @param ids the logs to fetch
   * @param ok sends the answer
   * @param fail sends an error
   */
  download(ids: number[], ok: Reply, fail: Fail): void {
    const refused = refusal(this.armed(), this.run !== undefined)
    if (refused) {
      fail(...refused)

      return
    }
    const wanted = ids.filter(id => this.logs.some(log => log.id === id && !log.downloaded))
    wanted.forEach(id => this.progress(id, 'queued', this.fetched.get(id) ?? 0))
    const whole = ids.filter(id => this.logs.some(log => log.id === id && log.downloaded))
    this.run = this.begin(wanted, whole, ok)

    if (wanted.length === 0) {
      this.run.finish(false)
    }
  }

  /**
   * Stops the download, if there is one: what was fetched is kept.
   *
   * @param ok sends the (empty) answer
   */
  cancel(ok: Reply): void {
    this.run?.finish(true)
    ok(null)
  }

  /**
   * Erases the logs that were downloaded and keeps the others.
   *
   * @param ok sends the answer
   * @param fail sends an error
   */
  erase(ok: Reply, fail: Fail): void {
    const refused = refusal(this.armed(), this.run !== undefined)
    if (refused) {
      fail(...refused)

      return
    }
    const erased = this.logs.filter(log => log.downloaded).map(log => log.id)
    this.logs = this.logs.filter(log => !log.downloaded)
    ok({ erased, kept: this.logs.length })
  }

  /**
   * The logs the vehicle starts with.
   *
   * @returns copies of them
   */
  private initial(): VehicleLog[] {
    return (this.options.logs ?? MOCK_LOGS).map(log => ({ ...log }))
  }

  /**
   * Starts a run.
   *
   * @param queue the logs to fetch
   * @param done the logs asked for that were whole already
   * @param ok sends the answer when it ends
   * @returns the run
   */
  private begin(queue: number[], done: number[], ok: Reply): Run {
    const timer = setInterval(() => this.tick(), Math.max(1, this.options.intervalMs))
    const run: Run = {
      queue,
      done,
      timer,
      step: 0,
      from: 0,
      finish: stopped => {
        clearInterval(timer)
        this.run = undefined
        ok({ ids: run.done, stopped })
      },
    }

    return run
  }

  /**
   * Says how a log is doing.
   *
   * @param id the log
   * @param state how it is doing
   * @param received how many bytes are fetched
   * @param resumedFrom where it began, when that was not the start
   */
  private progress(id: number, state: LogsProgress['state'], received: number, resumedFrom?: number): void {
    const total = this.logs.find(log => log.id === id)?.size ?? 0
    const payload: LogsProgress = { id, state, received, total, ...resumedFrom ? { resumedFrom } : {} }
    this.send({ k: 'event', n: 'logs.progress', p: payload })
  }

  /** One step of the run: the next part of the log at the head of the queue. */
  private tick(): void {
    const { run } = this
    const log = this.logs.find(l => l.id === run?.queue[0])
    if (run && log) {
      this.fetch(run, log)
    } else {
      run?.finish(false)
    }
  }

  /**
   * Where a log began is where an earlier try left off: fixed when its first step is taken.
   *
   * @param run the run
   * @param log the log
   */
  private startLog(run: Run, log: VehicleLog): void {
    if (run.step === 0) {
      run.from = this.fetched.get(log.id) ?? 0
    }
  }

  /**
   * Fetches a step of a log, and finishes it on the last one.
   *
   * @param run the run
   * @param log the log
   */
  private fetch(run: Run, log: VehicleLog): void {
    this.startLog(run, log)
    const { from } = run
    const resumedFrom = from > 0 ? from : undefined
    run.step += 1

    if (run.step < Math.max(1, this.options.steps)) {
      const received = Math.min(log.size, from + Math.round((log.size - from) * run.step / this.options.steps))
      this.fetched.set(log.id, received)
      this.progress(log.id, 'downloading', received, resumedFrom)
    } else {
      this.complete(run, log, resumedFrom)
    }
  }

  /**
   * A log is whole: it is marked so, and the run goes on to the next, or ends.
   *
   * @param run the run
   * @param log the log
   * @param resumedFrom where it began, when that was not the start
   */
  private complete(run: Run, log: VehicleLog, resumedFrom: number | undefined): void {
    log.downloaded = true
    this.fetched.delete(log.id)
    this.progress(log.id, 'done', log.size, resumedFrom)
    run.done.push(log.id)
    run.queue.shift()
    run.step = 0

    if (run.queue.length === 0) {
      run.finish(false)
    }
  }
}
