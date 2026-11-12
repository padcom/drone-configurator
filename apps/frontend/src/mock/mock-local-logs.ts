// The logs on this computer, as the mock has them (the contract's `logs.local.*`): a list of copies, a read that tells how far it
// is and can be cancelled, the changes of flight mode, series thinned for a chart, and a review of a verified log. The numbers
// are made up for the mock (a smooth flight of two minutes with one vibration peak and a gap in the altitude), the rules are the
// backend's: a log is reviewed only when it is verified, a series is asked of a log that was read, a part of the time with no
// sample is left out, and a field the log lacks is not found.
import type { Envelope } from '@pico-desktop/protocol'
import type {
  LocalLog, LocalLogSummary, LogsLocalSeries, ModeChange, ReviewFinding, SeriesAsk, SeriesPoint, SeriesResult,
} from '@/generated/app'

type Reply = (p: Envelope['p']) => void
type Fail = (code: string, message: string) => void

/** The first and last times of the mock flights (microseconds): two minutes. */
const FIRST_US = 1_000_000
const LAST_US = 121_000_000

/** A copy in the mock's folder, and what its read finds. */
interface MockCopy {
  log: LocalLog
  summary: LocalLogSummary
  modes: ModeChange[]
  review: ReviewFinding[]
  /** Whether it has been read since the mock started. */
  read: boolean
}

const MODES: ModeChange[] = [
  { timeUs: 1_000_000, mode: 0 },
  { timeUs: 11_000_000, mode: 4 },
  { timeUs: 71_000_000, mode: 5 },
  { timeUs: 111_000_000, mode: 9 },
]

const FIRMWARE = 'ArduCopter V4.7.2 (fb773567)'

/**
 * The review of the mock flights.
 *
 * @param peak the vibration peak (m/s/s)
 * @returns the findings
 */
function reviewOf(peak: number): ReviewFinding[] {
  const level = peak > 30 ? 'warn' : 'ok'

  return [
    { id: 'vibration.x', level, value: peak, limit: 30, atUs: 48_000_000, samples: 1200 },
    { id: 'vibration.y', level: 'ok', value: 12, limit: 30, atUs: 20_000_000, samples: 1200 },
    { id: 'vibration.z', level: 'ok', value: 9, limit: 30, atUs: 20_000_000, samples: 1200 },
    { id: 'vibration.clipping', level: 'ok', value: 0, limit: 0 },
    { id: 'gps.satellites', level: 'ok', value: 13, limit: 12, atUs: 30_000_000, samples: 400 },
    { id: 'gps.hdop', level: 'ok', value: 0.9, limit: 1.5, atUs: 30_000_000, samples: 400 },
    { id: 'gps.fix', level: 'ok', value: 0, limit: 0, samples: 400 },
    { id: 'ekf.variance', level: 'ok', value: 0.3, limit: 0.8, atUs: 50_000_000, samples: 800 },
    { id: 'errors.logged', level: 'ok', value: 0, limit: 0 },
    { id: 'battery.voltage', level: 'info', value: 14.9, limit: 0, atUs: 119_000_000, samples: 400 },
    { id: 'battery.current', level: 'info', value: 21, limit: 0, atUs: 12_000_000, samples: 400 },
  ]
}

/** What a mock flight is like. */
interface Flight {
  id: number
  modified: number
  verified: boolean
  peak: number
  times: boolean
}

/**
 * A copy of the mock.
 *
 * @param f what it is like
 * @returns the copy
 */
function copyOf(f: Flight): MockCopy {
  return {
    log: {
      vehicle: 'uid-mock',
      crc: '1a2b3c4d',
      key: `uid-mock/0000000${f.id}-1a2b3c4d.BIN`,
      id: f.id,
      size: 6_200_000 + f.id,
      modified: f.modified,
    },
    summary: {
      verified: f.verified,
      messages: 152_000,
      problems: 0,
      ...f.times ? { firstUs: FIRST_US, lastUs: LAST_US, firmware: FIRMWARE } : {},
      modeChanges: f.times ? MODES.length : 0,
    },
    modes: f.times ? MODES : [],
    review: reviewOf(f.peak),
    read: false,
  }
}

/**
 * The copies the mock has: a verified flight with a vibration peak, a verified one that is clean, a copy whose bytes are not
 * the CRC in its name (read, not reviewed), and a log with no times in it.
 *
 * @returns the copies
 */
function initial(): MockCopy[] {
  return [
    copyOf({ id: 3, modified: 1_783_300_000_000, verified: true, peak: 41, times: true }),
    copyOf({ id: 2, modified: 1_783_200_000_000, verified: false, peak: 16, times: true }),
    copyOf({ id: 1, modified: 1_783_100_000_000, verified: true, peak: 16, times: true }),
    copyOf({ id: 4, modified: 1_783_000_000_000, verified: true, peak: 0, times: false }),
  ]
}

/** A mock signal: its value at a time (seconds from the start of the log), or null where the mock has none. */
type Signal = (seconds: number) => number | null

/** The signals of the mock flight, by `message.field`: what the mock flight has and the log of another vehicle may not. */
const SIGNALS: Readonly<Record<string, Signal>> = {
  'ATT.Roll': s => 10 * Math.sin(s / 6),
  'ATT.Pitch': s => 6 * Math.cos(s / 9),
  // The altitude has a gap from 70 s to 75 s.
  'CTUN.Alt': s => (s >= 70 && s < 75 ? null : Math.min(30, s * 2, 120 - s)),
  'VIBE.VibeX': s => 8 + 4 * Math.sin(s / 3 + 1),
  'VIBE.VibeY': s => 8 + 4 * Math.sin(s / 3 + 2),
  'VIBE.VibeZ': s => 8 + 4 * Math.sin(s / 3 + 3),
}

/** The mock flight's one vibration peak: 41 m/s/s on X, one sample, at 47 s from the start of the log. */
const PEAK_S = 47

/** The times the mock cuts: first and last (microseconds), the number of parts; `known` is false for a log with no times. */
interface Range {
  from: number
  to: number
  buckets: number
  known: boolean
}

/**
 * Whether a part of the time has the mock flight's one vibration peak in it.
 *
 * @param key which series it is
 * @param seconds where the part begins
 * @param length how long the part is (seconds)
 * @returns true for the part with the peak
 */
function holdsPeak(key: string, seconds: number, length: number): boolean {
  return key === 'VIBE.VibeX' && seconds <= PEAK_S && PEAK_S < seconds + length
}

/**
 * One part of the time of a series: its smallest and largest value, or nothing where the signal has none.
 *
 * @param signal the signal
 * @param key which series it is
 * @param range the times
 * @param index the part
 * @returns the point, or null
 */
function pointAt(signal: Signal, key: string, range: Range, index: number): SeriesPoint | null {
  const part = (range.to - range.from + 1) / range.buckets
  const seconds = (index * part) / 1e6
  const a = signal(seconds)
  const b = signal(seconds + part / 2e6)
  if (a === null || b === null) {
    return null
  }

  // The peak is one sample: the part that has it keeps it as its largest value.
  return { index, min: Math.min(a, b), max: holdsPeak(key, seconds, part / 1e6) ? 41 : Math.max(a, b), count: 10 }
}

/**
 * The points of a series: the parts of the time that the signal has a value for.
 *
 * @param signal the signal
 * @param key which series it is
 * @param range the times
 * @returns the points
 */
function pointsOf(signal: Signal, key: string, range: Range): SeriesPoint[] {
  const all = Array.from({ length: range.buckets }, (_, index) => pointAt(signal, key, range, index))

  return all.filter((point): point is SeriesPoint => point !== null)
}

/**
 * One series of the answer.
 *
 * @param ask what is asked
 * @param range the times
 * @returns the result
 */
function resultOf(ask: SeriesAsk, range: Range): SeriesResult {
  const key = `${ask.message}.${ask.field}`
  const signal = SIGNALS[key]
  const found = range.known && signal !== undefined

  return {
    message: ask.message,
    field: ask.field,
    found,
    points: found ? pointsOf(signal, key, range) : [],
    invalid: 0,
  }
}

/**
 * The times of a log that was read, cut in parts; `known` is false for a log with no times.
 *
 * @param summary what the read found
 * @param buckets how many parts
 * @returns the range
 */
function rangeOf(summary: LocalLogSummary, buckets: number): Range {
  if (summary.firstUs === undefined) {
    return { from: 0, to: 0, buckets, known: false }
  }

  return { from: Number(summary.firstUs), to: Number(summary.lastUs ?? summary.firstUs), buckets, known: true }
}

/** The logs on this computer, as the mock has them. */
export class MockLocalLogs {
  copies = initial()
  /** The read that is under way, to stop it. */
  reading: { timer: ReturnType<typeof setInterval>, fail: Fail } | undefined

  /**
   * Makes the library.
   *
   * @param send sends an event to the interface
   * @param stepMs how long a step of a read takes
   */
  constructor(private readonly send: (e: Omit<Envelope, 'v'>) => void, private readonly stepMs = 5) {}

  /**
   * The copy with a key, or an error to the caller.
   *
   * @param key the key
   * @param fail sends an error
   * @returns the copy, or undefined after it failed
   */
  private find(key: string, fail: Fail): MockCopy | undefined {
    const copy = this.copies.find(c => c.log.key === key)
    if (!copy) {
      fail('NOT_FOUND', 'there is no such log')
    }

    return copy
  }

  /**
   * The copy with a key that was read (else the caller is told it was not).
   *
   * @param key the key
   * @param fail sends an error
   * @returns the copy, or undefined after it failed
   */
  private findRead(key: string, fail: Fail): MockCopy | undefined {
    const copy = this.find(key, fail)
    if (copy && !copy.read) {
      fail('NOT_READ', 'the log has not been read (lately), or it changed since: read it again')

      return undefined
    }

    return copy
  }

  /**
   * Answers with the copies, newest first, with what a read found of those that were read.
   *
   * @param ok sends the answer
   */
  list(ok: Reply): void {
    const logs = this.copies.map(c => (c.read ? { ...c.log, summary: c.summary } : { ...c.log }))
    ok({ logs: logs.sort((a, b) => Number(b.modified) - Number(a.modified)), truncated: false })
  }

  /**
   * Reads a log: three steps of progress, then what is in it.
   *
   * @param key the log
   * @param ok sends the answer
   * @param fail sends an error
   */
  read(key: string, ok: Reply, fail: Fail): void {
    const copy = this.find(key, fail)
    if (!copy) {
      return
    }
    if (this.reading) {
      fail('BUSY', 'a log is being read')

      return
    }
    let step = 0
    const total = Number(copy.log.size)
    const timer = setInterval(() => {
      step += 1
      this.send({ k: 'event', n: 'logs.local.progress', p: { key, bytes: Math.floor(total * step / 3), total } })

      if (step >= 3) {
        clearInterval(timer)
        this.reading = undefined
        copy.read = true
        ok(copy.summary)
      }
    }, this.stepMs)
    this.reading = { timer, fail }
  }

  /**
   * Stops the read that is under way: it fails with ABORTED.
   *
   * @param ok sends the (empty) answer
   */
  cancel(ok: Reply): void {
    if (this.reading) {
      clearInterval(this.reading.timer)
      this.reading.fail('ABORTED', 'the read was stopped')
      this.reading = undefined
    }
    ok(null)
  }

  /**
   * The changes of mode of a log that was read.
   *
   * @param key the log
   * @param ok sends the answer
   * @param fail sends an error
   */
  modes(key: string, ok: Reply, fail: Fail): void {
    const copy = this.findRead(key, fail)
    if (copy) {
      ok({ modes: copy.modes, cut: false })
    }
  }

  /**
   * The review of a log that was read and is verified.
   *
   * @param key the log
   * @param ok sends the answer
   * @param fail sends an error
   */
  review(key: string, ok: Reply, fail: Fail): void {
    const copy = this.findRead(key, fail)
    if (copy && !copy.summary.verified) {
      fail('NOT_VERIFIED', 'the log is not verified (its CRC is not the one the vehicle gave): no review')
    } else if (copy) {
      ok({ findings: copy.review })
    }
  }

  /**
   * Series thinned for a chart: the time cut in parts, the smallest and largest value of each, a gap where there is no value.
   *
   * @param ask the request
   * @param ask.key the log
   * @param ask.series the series asked for
   * @param ask.buckets how many parts
   * @param ok sends the answer
   * @param fail sends an error
   */
  series(ask: { key: string, series: SeriesAsk[], buckets: number }, ok: Reply, fail: Fail): void {
    const copy = this.findRead(ask.key, fail)
    if (!copy) {
      return
    }
    const range = rangeOf(copy.summary, ask.buckets)
    const answer: LogsLocalSeries = {
      fromUs: range.from,
      toUs: range.to,
      buckets: ask.buckets,
      series: ask.series.map(s => resultOf(s, range)),
    }
    ok(answer)
  }
}
