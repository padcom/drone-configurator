// What the Logging setup page knows of ArduPilot's logging parameters, and the size it estimates. The NAMES of the bits are not
// here: they are the parameter metadata's (the file the user loads; ArduPilot's definitions are not bundled). What is here is
// only what the app itself needs by position, with where it was checked.
//
// Checked in the ArduPilot source (shared/tools/ardupilot, commit 2a54162; the CI vehicle runs 4.7.2, and these have not moved):
//   - ArduCopter/Parameters.cpp:208-213, `LOG_BITMASK` @Bitmask: 0 Fast Attitude, 2 GPS, 17 Motors, 19 Raw IMU (and 1 Medium
//     Attitude, 3 System Performance, 4 Control Tuning, 5 Navigation Tuning, 6 RC input, 7 IMU, 8 Mission Commands, 9 Battery
//     Monitor, 10 RC output, 11 Optical Flow, 12 PID, 13 Compass, 15 Camera, 18 Fast IMU, 20 Video Stabilization, 21 Fast
//     harmonic notch logging); the same positions are `MASK_LOG_*` in ArduCopter/defines.h:87-107.
//   - libraries/AP_InertialSensor/BatchSampler.cpp:9-43: `INS_LOG_BAT_MASK` (default 0 = off; bits 0..2 are IMU1..IMU3; takes
//     effect after a reboot), `INS_LOG_BAT_OPT` (bit 0 sensor-rate logging, 1 post-filter, 2 pre- and post-filter),
//     `INS_LOG_BAT_CNT` (samples per batch, default 1024, a multiple of 32, after a reboot), `INS_LOG_BAT_LGIN` (ms between two
//     ISBD messages, default 20) and `INS_LOG_BAT_LGCT` (samples in a message, default 32).
//   - BatchSampler.cpp:181-243: one batch is collected at a time (one IMU, accelerometer or gyro, then the next), and then
//     pushed as BAT_CNT / 32 ISBD messages, no more often than one per LGIN ms.
import type { LocalLog, LocalLogSummary } from '@/generated/app'
import { asNumber, lengthOf } from '@/lib/logs/localLogs'
import type { Metadata } from '@/lib/params/metadata'

/** The logging parameters the page reads and queues. */
export const LOG_BITMASK = 'LOG_BITMASK'

export const BATCH_MASK = 'INS_LOG_BAT_MASK'

export const BATCH_OPT = 'INS_LOG_BAT_OPT'

export const BATCH_COUNT = 'INS_LOG_BAT_CNT'

export const BATCH_INTERVAL = 'INS_LOG_BAT_LGIN'

/** Every parameter the page can queue: the writes of these are refused while the vehicle is armed (or may be). */
export const LOGGING_PARAMS: readonly string[] = [LOG_BITMASK, BATCH_MASK, BATCH_OPT, BATCH_COUNT, BATCH_INTERVAL]

/** The positions of `LOG_BITMASK` the page shows when no metadata names the bits: attitude, GPS, motors and the raw IMU. */
export const STREAM_BITS: readonly number[] = [0, 2, 17, 19]

/** The size of an ISBD message: type header (3), TimeUS (8), N (2), seqno (2), and three arrays of 32 int16 (3 × 64). */
export const ISBD_BYTES = 207

/**
 * The bit positions that are set in a value.
 *
 * @param value the parameter's value
 * @returns the positions, ascending (none for a value that is not a whole number from 0 up to 2^31)
 */
export function bitsOf(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x7FFFFFFF) {
    return []
  }

  return Array.from({ length: 31 }, (_, bit) => bit).filter(bit => Math.floor(value / 2 ** bit) % 2 === 1)
}

/**
 * A value with one bit turned on or off.
 *
 * @param value the parameter's value
 * @param bit the position
 * @param on whether the bit is to be set
 * @returns the new value
 */
export function withBit(value: number, bit: number, on: boolean): number {
  const set = bitsOf(value).includes(bit)

  if (set === on) {
    return value
  }

  return on ? value + 2 ** bit : value - 2 ** bit
}

/** One bit of a bitmask, as the page lists it. */
export interface BitRow {
  /** The position. */
  bit: number
  /** The name the metadata gives it, or null when no metadata names it. */
  name: string | null
}

/**
 * The bits of `LOG_BITMASK` to list: every bit the metadata names, else the four the app knows by position. Bits that are set in
 * the value and are not named stay in the list, so that nothing that is on is hidden.
 *
 * @param meta the loaded metadata
 * @param value the value on the vehicle
 * @returns the rows, by position
 */
export function streamRows(meta: Metadata, value: number): BitRow[] {
  const named = meta.get(LOG_BITMASK)?.bits ?? {}
  const positions = new Set<number>([...Object.keys(named).map(Number), ...bitsOf(value)])
  if (Object.keys(named).length === 0) {
    STREAM_BITS.forEach(bit => positions.add(bit))
  }

  return [...positions].filter(Number.isInteger).sort((a, b) => a - b).map(bit => ({ bit, name: named[String(bit)] ?? null }))
}

/** What the batch sampling is set to. */
export interface BatchSetting {
  /** The IMUs that are logged (bits of `INS_LOG_BAT_MASK`). */
  mask: number
  /** The interval between two ISBD messages (ms). */
  intervalMs: number
  /** The samples in a batch. */
  count: number
}

/**
 * The most the batch sampling writes: one ISBD message of 207 bytes every interval, as long as there is a batch to push. (The
 * sampler collects one batch at a time and pushes it before it collects the next, so this is an upper bound, and it does not
 * grow with the number of IMUs.)
 *
 * @param setting what the batch sampling is set to
 * @returns bytes a minute, or 0 when it is off
 */
export function batchBytesPerMinute(setting: BatchSetting): number {
  if (setting.mask === 0 || setting.count < 32 || setting.intervalMs <= 0) {
    return 0
  }

  return Math.round(60000 / setting.intervalMs) * ISBD_BYTES
}

/** The newest verified log's size and length, as far as the library knows them. */
export interface Measured {
  /** Bytes in the file. */
  bytes: number
  /** Seconds from its first message to its last. */
  seconds: number
}

/**
 * Whether a log can say how fast it was written: it is verified and has a length.
 *
 * @param log the log
 * @returns true if it can
 */
function isMeasurable(log: LocalLog): boolean {
  return log.summary !== undefined && log.summary.verified && lengthOf(log.summary) !== null
}

/**
 * The size and length of the newest verified log that has a length.
 *
 * @param logs the logs on this computer
 * @returns the log's size and length, or null when there is none
 */
export function measuredOf(logs: LocalLog[]): Measured | null {
  const [newest] = logs.filter(isMeasurable).sort((a, b) => asNumber(b.modified) - asNumber(a.modified))

  return newest === undefined ? null : { bytes: asNumber(newest.size), seconds: lengthOf(newest.summary as LocalLogSummary) ?? 0 }
}

/**
 * Bytes a minute that a log was written at.
 *
 * @param measured the log
 * @returns bytes a minute, or null when the log has no length to divide by
 */
export function measuredBytesPerMinute(measured: Measured | null): number | null {
  return measured === null || measured.seconds <= 0 ? null : (measured.bytes / measured.seconds) * 60
}

/**
 * Megabytes (10^6 bytes), at one decimal for the page.
 *
 * @param bytes the size
 * @returns megabytes
 */
export function megabytes(bytes: number): number {
  return Math.round(bytes / 1e5) / 10
}

/**
 * Whether queued changes include a logging parameter (their write is refused while the vehicle may be armed).
 *
 * @param ids the parameters with a change queued
 * @returns true if any is a logging parameter
 */
export function includesLogging(ids: readonly string[]): boolean {
  return ids.some(id => LOGGING_PARAMS.includes(id))
}
