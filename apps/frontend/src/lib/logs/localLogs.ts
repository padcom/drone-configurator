// What the Flights view makes of the backend's local-log answers: seconds along a log, flight-mode spans, the points of a chart
// from the thinned series, the tone of a review finding. Pure functions; nothing here invents a value (a part of the time with no
// samples is a gap, a mode the log does not name by firmware is its number).
import type { ChartPoint } from '@/lib/charts/chart'
import type { LocalLogSummary, LogsLocalSeries, ModeChange, ReviewFinding, SeriesResult } from '@/generated/app'

/**
 * A number that the contract gave as a number or a bigint (64-bit values), as a number.
 *
 * @param value the value
 * @returns the number (the values here are microseconds and sizes: far inside 2^53)
 */
export const asNumber = (value: number | bigint): number => Number(value)

/** The flight modes of ArduCopter, by number (ArduCopter/mode.h). */
const COPTER_MODES: Readonly<Record<number, string>> = {
  0: 'Stabilize',
  1: 'Acro',
  2: 'AltHold',
  3: 'Auto',
  4: 'Guided',
  5: 'Loiter',
  6: 'RTL',
  7: 'Circle',
  9: 'Land',
  11: 'Drift',
  13: 'Sport',
  14: 'Flip',
  15: 'AutoTune',
  16: 'PosHold',
  17: 'Brake',
  18: 'Throw',
  19: 'Avoid_ADSB',
  20: 'Guided_NoGPS',
  21: 'Smart_RTL',
  22: 'FlowHold',
  23: 'Follow',
  24: 'ZigZag',
  25: 'SystemID',
  26: 'Autorotate',
  27: 'Auto_RTL',
}

/**
 * The name of a flight mode, when the firmware is one whose modes are known (ArduCopter): what a mode number means depends on the
 * firmware, so for any other (or none named) there is no name, and the number is all there is.
 *
 * @param firmware the firmware text the log names ("ArduCopter V4.7.2 (...)"), if it names one
 * @param mode the mode number
 * @returns the name, or null
 */
export function modeName(firmware: string | undefined, mode: number): string | null {
  if (firmware === undefined || !firmware.startsWith('ArduCopter')) {
    return null
  }

  return COPTER_MODES[mode] ?? null
}

/** A stretch of the log in one flight mode, in seconds from the start of the log. */
export interface ModeSpan {
  /** Where it begins. */
  fromS: number
  /** Where it ends. */
  toS: number
  /** The mode number. */
  mode: number
}

/**
 * How long a log is.
 *
 * @param summary what a read found
 * @returns the length of the log in seconds, or null when it has no times
 */
export function lengthOf(summary: LocalLogSummary): number | null {
  if (summary.firstUs === undefined || summary.lastUs === undefined) {
    return null
  }

  return Math.max(0, asNumber(summary.lastUs) - asNumber(summary.firstUs)) / 1e6
}

/**
 * The stretches of the log in each flight mode: a mode lasts until the next change, the last until the end of the log. The part
 * before the first change has no mode that the log names, so it has no span.
 *
 * @param modes the changes of mode, in order
 * @param summary what a read found
 * @returns the spans, in order
 */
export function modeSpans(modes: ModeChange[], summary: LocalLogSummary): ModeSpan[] {
  const length = lengthOf(summary)
  if (length === null || summary.firstUs === undefined) {
    return []
  }
  const start = asNumber(summary.firstUs)
  const at = (us: number | bigint) => Math.min(length, Math.max(0, (asNumber(us) - start) / 1e6))

  return modes.map((change, i) => ({
    fromS: at(change.timeUs),
    toS: i + 1 < modes.length ? at(modes[i + 1]?.timeUs ?? 0) : length,
    mode: change.mode,
  })).filter(span => span.toS > span.fromS)
}

/**
 * A time along a log as the board writes it: minutes and seconds.
 *
 * @param seconds the time
 * @returns "0:47"
 */
export function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))

  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * The points of a chart line from a thinned series: one per part of the time that has samples (at the middle of the part, in
 * seconds from the start of the log), with the smallest and largest value of its samples as the envelope; and a gap (a point with
 * no value) where parts have no samples between parts that have, so that the line breaks there and does not run across the time
 * the log has nothing for.
 *
 * @param result one series of the answer
 * @param answer the answer it is in (the times and the parts)
 * @param firstUs the time of the first message of the log
 * @returns the points, in order
 */
export function pointsOf(result: SeriesResult, answer: LogsLocalSeries, firstUs: number): ChartPoint[] {
  const from = asNumber(answer.fromUs)
  const part = (asNumber(answer.toUs) - from + 1) / answer.buckets
  const centre = (index: number) => (from + (index + 0.5) * part - firstUs) / 1e6
  const out: ChartPoint[] = []
  let last = -2

  for (const p of result.points) {
    if (p.index > last + 1 && last >= 0) {
      out.push({ x: centre(last + 1), y: null })
    }
    out.push({ x: centre(p.index), y: (p.min + p.max) / 2, min: p.min, max: p.max })
    last = p.index
  }

  return out
}

/** How a finding looks: by tone. */
export type Tone = 'ok' | 'warn' | 'error' | 'muted'

/**
 * The tone of a review finding.
 *
 * @param finding the finding
 * @returns ok, warn, error (bad), or muted (told, or no data)
 */
export function toneOf(finding: ReviewFinding): Tone {
  switch (finding.level) {
    case 'ok': return 'ok'
    case 'warn': return 'warn'
    case 'bad': return 'error'
    default: return 'muted'
  }
}

/** The levels that count for "the worst", from the best. */
const RANK: readonly string[] = ['ok', 'warn', 'bad']

/**
 * The worst thing the review found, to say in a list: bad, then warn, then ok; none when it has nothing but information.
 *
 * @param findings the findings
 * @returns the worst level among ok, warn and bad, or null
 */
export function worstOf(findings: ReviewFinding[]): 'ok' | 'warn' | 'bad' | null {
  const ranked = findings.map(f => RANK.indexOf(f.level)).filter(rank => rank >= 0)

  return ranked.length === 0 ? null : (RANK[Math.max(...ranked)] as 'ok' | 'warn' | 'bad')
}
