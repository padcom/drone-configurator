// The message browser and the export of the log that is open in Flights. The backend (`logs.local.messages`, `.at`, `.series`,
// `.export`) does one pass over the file for each question, so the questions are asked one after the other; while the cursor
// moves, only the latest place is asked for. Nothing is made up: a field with no value says so, a kind the log does not have at
// that time says so, and an array (a batch of samples) is not a value and is never offered to a chart.
import { type Ref, type ShallowRef, ref, shallowRef } from 'vue'
import { type BackendClient, describeError, toBackendError } from '@/backend/client'
import type { AtRow, LocalLogAt, LogsLocalSeries, MessageType, SeriesResult } from '@/generated/app'
import type { ChartPoint } from '@/lib/charts/chart'
import { asNumber, pointsOf } from '@/lib/logs/localLogs'

/** What the browser needs. */
export interface BrowserDeps {
  /** The link to the backend. */
  client: BackendClient
}

/** A field that was pressed to be charted: where it is, and its line. */
export interface Graphed {
  /** The kind of message. */
  message: string
  /** The field. */
  field: string
  /** The instance, when the kind has them. */
  instance: number | null
  /** The unit the log names. */
  unit?: string
  /** Whether the log has it as a number at all. */
  found: boolean
  /** The points of the line. */
  points: ChartPoint[]
}

/** The formats of an export. */
export type ExportFormat = 'csv' | 'gpx' | 'kml'

/** How an export stands. */
export type ExportState
  = | { kind: 'idle' }
    | { kind: 'saved', path: string, rows: number, format: ExportFormat }
    | { kind: 'cancelled' }
    | { kind: 'exists', path: string, format: ExportFormat, message?: string }
    | { kind: 'unavailable', format: ExportFormat, reason: string }
    | { kind: 'failed', text: string }

/** An export request. */
interface ExportAsk {
  key: string
  format: ExportFormat
  message?: string
  path?: string
  overwrite?: boolean
}

/** How many parts the time is cut in for a field that was pressed. */
const PARTS = 400

/** The browser. */
export interface BrowserModel {
  /** The kinds of message the open log has. */
  readonly types: ShallowRef<MessageType[]>
  /** How many more kinds there are than are listed (a recording can have more than 255). */
  readonly more: Ref<number>
  /** The kind that is chosen ('' when none). */
  readonly message: Ref<string>
  /** The last message of each instance of that kind at the cursor, or null before the first answer. */
  readonly at: ShallowRef<LocalLogAt | null>
  /** The instance that is chosen (its number), or null when the kind has none. */
  readonly instance: Ref<number | null>
  /** The field that was pressed, charted. */
  readonly graphed: ShallowRef<Graphed | null>
  /** How the export stands. */
  readonly exporting: ShallowRef<ExportState>
  /** Whether a question is under way. */
  readonly busy: Ref<boolean>
  /** What the last question that failed said. */
  readonly error: ShallowRef<string | null>
  /** Asks which kinds of message the log has. */
  load: (key: string) => Promise<void>
  /** Chooses a kind of message, and asks for it at the same place. */
  choose: (message: string) => void
  /** Asks for the chosen kind at a time (microseconds from the vehicle's boot). */
  moveTo: (timeUs: number) => void
  /** Charts a field of the chosen kind and instance. */
  graph: (field: string, firstUs: number) => Promise<void>
  /** Writes the log or the chosen kind to a file the user chooses. */
  exportAs: (format: ExportFormat) => Promise<void>
  /** Writes it again over the file that was there, which the user has named in a second press. */
  replace: () => Promise<void>
  /** Forgets everything (the log was closed). */
  clear: () => void
  /** Resolves when the questions asked so far are answered (the backend reads one thing at a time, so a read waits for them). */
  settled: () => Promise<void>
}

/**
 * What an export answer means.
 *
 * @param done the answer
 * @param done.path the file, absent when the user cancelled the dialog
 * @param done.exists true when the file is there and nothing was written
 * @param done.rows how many rows were written
 * @param ask the request that was sent
 * @returns the state
 */
function stateAfter(done: { path?: string, exists?: boolean, rows: number }, ask: ExportAsk): ExportState {
  const { path, rows } = done
  const { format, message } = ask
  if (path === undefined) {
    return { kind: 'cancelled' }
  }

  return done.exists === true
    ? { kind: 'exists', path, format, ...message === undefined ? {} : { message } }
    : { kind: 'saved', path, rows, format }
}

/**
 * The unit of a series, as the part of a line that has it.
 *
 * @param result the series, if the answer has one
 * @returns `{ unit }`, or nothing
 */
function unitOf(result: SeriesResult | undefined): { unit?: string } {
  return result?.unit === undefined ? {} : { unit: result.unit }
}

/**
 * The line of a field that was pressed.
 *
 * @param answer what the backend answered
 * @param what the field and instance
 * @param what.message the kind
 * @param what.field the field
 * @param what.instance the instance, if any
 * @param firstUs the time of the log's first message
 * @returns the line
 */
function graphedFrom(
  answer: LogsLocalSeries,
  what: { message: string, field: string, instance: number | null },
  firstUs: number,
): Graphed {
  const [result] = answer.series
  const found = result?.found === true
  const points = result !== undefined && found ? pointsOf(result, answer, firstUs) : []

  return { ...what, ...unitOf(result), found, points }
}

/**
 * The microseconds of a place along the log.
 *
 * @param seconds seconds from the start of the log
 * @param firstUs the time of the log's first message
 * @returns microseconds from the vehicle's boot
 */
export function timeAt(seconds: number, firstUs: number | bigint): number {
  return asNumber(firstUs) + seconds * 1e6
}

/**
 * The instance to keep after an answer: the chosen one if the kind still has it, else the first.
 *
 * @param rows the rows of the answer
 * @param chosen the instance that was chosen
 * @returns the instance, or null when the kind has none
 */
function instanceAmong(rows: AtRow[], chosen: number | null): number | null {
  const numbers = rows.map(row => row.instance).filter((n): n is number => n !== undefined)

  return chosen !== null && numbers.includes(chosen) ? chosen : numbers[0] ?? null
}

/** The browser. */
class Browser implements BrowserModel {
  readonly types = shallowRef<MessageType[]>([])
  readonly more = ref(0)
  readonly message = ref('')
  readonly at = shallowRef<LocalLogAt | null>(null)
  readonly instance = ref<number | null>(null)
  readonly graphed = shallowRef<Graphed | null>(null)
  readonly exporting = shallowRef<ExportState>({ kind: 'idle' })
  readonly busy = ref(false)
  readonly error = shallowRef<string | null>(null)
  private key = ''
  private time: number | null = null
  private asking = false
  private running: Promise<void> = Promise.resolve()

  /**
   * Makes the browser.
   *
   * @param deps the client
   */
  constructor(private readonly deps: BrowserDeps) {}

  async load(key: string): Promise<void> {
    this.clear()
    this.key = key
    await this.run(async () => {
      const answer = await this.deps.client.call('logs.local.messages', { key })
      if (this.key === key) {
        this.types.value = [...answer.types].sort((a, b) => a.name.localeCompare(b.name))
        this.more.value = answer.more ?? 0
      }
    })
  }

  /**
   * Runs a question after the ones before it (the backend does one pass at a time), and keeps what it says if it fails.
   *
   * @param ask the question
   * @returns when it is answered
   */
  private run(ask: () => Promise<void>): Promise<void> {
    const before = this.running
    const next = (async () => {
      await before
      this.busy.value = true

      try {
        await ask()
      } catch (error) {
        this.error.value = describeError(error)
      } finally {
        this.busy.value = false
      }
    })()
    this.running = next

    return next
  }

  choose(message: string): void {
    this.message.value = message
    this.at.value = null
    this.instance.value = null
    this.graphed.value = null
    this.exporting.value = { kind: 'idle' }

    if (this.time !== null) {
      this.moveTo(this.time)
    }
  }

  moveTo(timeUs: number): void {
    this.time = timeUs

    if (this.message.value !== '' && !this.asking) {
      void this.askAt()
    }
  }

  /** Asks for the chosen kind at the latest place, and again if the place moved while it was asked. */
  private async askAt(): Promise<void> {
    const { key } = this
    const message = this.message.value
    const time = this.time ?? 0
    this.asking = true
    await this.run(async () => {
      const answer = await this.deps.client.call('logs.local.at', { key, message, timeUs: Math.max(0, Math.round(time)) })
      if (this.stillAsking(key, message)) {
        this.at.value = answer
        this.instance.value = instanceAmong(answer.rows, this.instance.value)
      }
    })
    this.asking = false

    if (this.time !== time && this.stillAsking(key, message)) {
      void this.askAt()
    }
  }

  /**
   * Whether the log and the kind are still the ones a question was asked for.
   *
   * @param key the log
   * @param message the kind
   * @returns true if they are
   */
  private stillAsking(key: string, message: string): boolean {
    return this.key === key && this.message.value === message
  }

  async graph(field: string, firstUs: number): Promise<void> {
    const { key } = this
    const message = this.message.value
    const instance = this.instance.value
    const instanceField = this.types.value.find(type => type.name === message)?.instanceField
    const where = instance !== null && instanceField !== undefined ? { whereField: instanceField, whereValue: instance } : {}
    await this.run(async () => {
      const series = [{ message, field, ...where }]
      const answer = await this.deps.client.call('logs.local.series', { key, series, buckets: PARTS })
      if (this.key === key) {
        this.graphed.value = graphedFrom(answer, { message, field, instance }, firstUs)
      }
    })
  }

  async exportAs(format: ExportFormat): Promise<void> {
    const message = format === 'csv' ? this.message.value : undefined
    await this.write({ key: this.key, format, ...message === undefined ? {} : { message } })
  }

  async replace(): Promise<void> {
    const state = this.exporting.value
    if (state.kind === 'exists') {
      const { path, format, message } = state
      await this.write({ key: this.key, format, ...message === undefined ? {} : { message }, path, overwrite: true })
    }
  }

  /**
   * Sends an export and keeps how it went.
   *
   * @param ask the request
   */
  private async write(ask: ExportAsk): Promise<void> {
    this.exporting.value = { kind: 'idle' }
    await this.run(async () => {
      try {
        this.exporting.value = stateAfter(await this.deps.client.call('logs.local.export', ask), ask)
      } catch (error) {
        const failure = toBackendError(error)
        this.exporting.value = failure.code === 'UNAVAILABLE'
          ? { kind: 'unavailable', format: ask.format, reason: failure.message }
          : { kind: 'failed', text: describeError(error) }
      }
    })
  }

  settled(): Promise<void> {
    return this.running
  }

  clear(): void {
    this.key = ''
    this.time = null
    this.types.value = []
    this.more.value = 0
    this.message.value = ''
    this.at.value = null
    this.instance.value = null
    this.graphed.value = null
    this.exporting.value = { kind: 'idle' }
    this.error.value = null
  }
}

/**
 * The browser.
 *
 * @param deps the client
 * @returns the model
 */
export function useLogBrowser(deps: BrowserDeps): BrowserModel {
  return new Browser(deps)
}
