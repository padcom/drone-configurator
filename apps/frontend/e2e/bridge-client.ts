// A second client of the backend, over the page's own bridge (`window.picoDesktop`), for the tests of what the app has no
// buttons for yet: it sends requests as envelopes the page's client never uses the ids of, and reads the answers (and the
// telemetry the app itself subscribed to) from a log that the page keeps of what the host sends it. The page's own handler still
// gets everything first: nothing is taken from the app.
import { type Envelope, decodeEnvelope, encodeEnvelope } from '@pico-desktop/protocol'
import type { E2eApp } from './launch'

/** The ids this client uses: far above any the page's client reaches in a test. */
const FIRST_ID = 1_000_000

/** How often the log is looked at (ms). */
const POLL_MS = 50

/** What the page keeps of one message of the host. */
interface Logged {
  /** Its number, from 1, as the page counted them. */
  n: number
  /** Whether it is an event of the telemetry stream. */
  telemetry: boolean
  /** Its bytes. */
  b: number[]
}

/** What a call came to. */
export interface Answer {
  /** The result, when the backend answered. */
  result?: unknown
  /** The backend's error, when it refused. */
  error?: { code: string, message: string }
}

/** The telemetry as far as these tests look at it. */
export interface Seen {
  /** Whether the vehicle's heartbeat says it is armed. */
  armed: boolean
  /** The flight mode its heartbeat names. */
  mode: string
  /** The pre-arm checks as SYS_STATUS says them, when it does. */
  prearm?: { enabled: boolean, passing: boolean, ageMs: number }
}

/**
 * Waits a while.
 *
 * @param ms how long
 */
const pause = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms)
})

/**
 * The number of the last of some logged messages.
 *
 * @param entries the messages, oldest first
 * @param otherwise what to say when there are none
 * @returns the number
 */
function lastNumber(entries: Logged[], otherwise: number): number {
  return entries.at(-1)?.n ?? otherwise
}

/** The client. */
export class BridgeClient {
  private id = FIRST_ID

  /**
   * Makes the client.
   *
   * @param app the app under test
   */
  constructor(private readonly app: E2eApp) {}

  /** Starts the log in the page: from now on every message of the host is also kept (the last 4000). */
  async install(): Promise<void> {
    await this.app.evaluate(`(() => {
      if (window.__bridgeLog) return
      const bridge = window.picoDesktop
      const previous = bridge.onmessage
      const log = []
      let count = 0
      window.__bridgeLog = log
      bridge.onmessage = (message, live) => {
        const bytes = Array.from(new Uint8Array(message))
        const text = String.fromCharCode(...bytes.slice(0, 80))
        count += 1
        log.push({ n: count, telemetry: text.includes('telemetry.stream'), b: bytes })
        if (log.length > 4000) log.splice(0, log.length - 4000)
        if (previous) previous(message, live)
      }
    })()`)
  }

  /**
   * What the page has logged after a message.
   *
   * @param after the number of the last message already seen
   * @returns the messages since, oldest first
   */
  private logged(after: number): Promise<Logged[]> {
    return this.app.evaluate<Logged[]>(`window.__bridgeLog.filter(entry => entry.n > ${after})`)
  }

  /**
   * The number of the last message logged.
   *
   * @returns the number (0 before any)
   */
  private last(): Promise<number> {
    return this.app.evaluate<number>('window.__bridgeLog.at(-1)?.n ?? 0')
  }

  /**
   * The answer to a request that a logged message is, if it is one.
   *
   * @param entry the message
   * @param id the request's id
   * @returns the answer, or null for any other message
   */
  private answerOf(entry: Logged, id: number): Answer | null {
    const envelope = decodeEnvelope(Uint8Array.from(entry.b))
    if (envelope.id !== id) {
      return null
    }
    if (envelope.k === 'response') {
      return { result: envelope.p }
    }

    return envelope.k === 'error' ? { error: envelope.err as Answer['error'] } : null
  }

  /**
   * The first answer to a request among logged messages.
   *
   * @param entries the messages, oldest first
   * @param id the request's id
   * @returns the answer, or null when none of them is
   */
  private firstAnswer(entries: Logged[], id: number): Answer | null {
    for (const entry of entries) {
      const answer = this.answerOf(entry, id)
      if (answer !== null) {
        return answer
      }
    }

    return null
  }

  /**
   * Waits for the answer to a request.
   *
   * @param id the request's id
   * @param from the number of the last message that was logged before the request was sent
   * @param timeoutMs how long to wait
   * @returns the result or the error
   * @throws {Error} when nothing answered in time
   */
  private async waitForAnswer(id: number, from: number, timeoutMs: number): Promise<Answer> {
    const deadline = Date.now() + timeoutMs
    let seen = from
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop -- one look after the other
      const entries = await this.logged(seen)
      const answer = this.firstAnswer(entries, id)
      if (answer !== null) {
        return answer
      }
      seen = lastNumber(entries, seen)
      // eslint-disable-next-line no-await-in-loop -- one look after the other
      await pause(POLL_MS)
    }
    throw new Error(`no answer to request ${id} within ${timeoutMs} ms`)
  }

  /**
   * Sends a request to the backend and waits for its answer.
   *
   * @param name the method
   * @param payload its request, if it has one
   * @param timeoutMs how long to wait
   * @returns the result or the error
   * @throws {Error} when nothing answered in time
   */
  async call(name: string, payload: unknown = null, timeoutMs = 20_000): Promise<Answer> {
    this.id += 1
    const { id } = this
    const from = await this.last()
    const bytes = encodeEnvelope({ k: 'request', id, n: name, p: payload } as Omit<Envelope, 'v'>)
    await this.app.evaluate(`window.picoDesktop.send(new Uint8Array(${JSON.stringify(Array.from(bytes))}).buffer)`)

    return this.waitForAnswer(id, from, timeoutMs)
  }

  /**
   * The latest telemetry the app was sent.
   *
   * @returns it, or null when there is none yet
   */
  async telemetry(): Promise<Seen | null> {
    const bytes = await this.app.evaluate<number[] | null>(
      '(() => { const last = window.__bridgeLog.filter(entry => entry.telemetry).at(-1); return last ? last.b : null })()',
    )

    return bytes === null ? null : decodeEnvelope(Uint8Array.from(bytes)).p as unknown as Seen
  }

  /**
   * Waits until the telemetry says something.
   *
   * @param what what is waited for
   * @param holds says whether the telemetry is what is waited for
   * @param timeoutMs how long to wait
   * @returns the telemetry that satisfied it
   * @throws {Error} when it never did
   */
  async until(what: string, holds: (seen: Seen) => boolean, timeoutMs: number): Promise<Seen> {
    const deadline = Date.now() + timeoutMs
    let latest: Seen | null = null
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop -- one look after the other
      latest = await this.telemetry()

      if (latest !== null && holds(latest)) {
        return latest
      }
      // eslint-disable-next-line no-await-in-loop -- one look after the other
      await pause(250)
    }
    throw new Error(`${what}: not within ${timeoutMs} ms (last telemetry: ${JSON.stringify(latest)})`)
  }
}
