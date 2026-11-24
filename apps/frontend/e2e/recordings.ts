// The recordings of the connections (#30) as the e2e tests look at them: the folder the app records into (under the test's own
// data folder), the recordings that ended (their CRC-32 in their name), and the frames a tlog holds, read the way every ground
// station writes it: an 8-byte big-endian time in microseconds, then the MAVLink frame.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { home } from './launch'
import { crc32 } from './mavlink-wire'

/** The app's data folder in this test's run, and the recordings folder in it (the default one). */
export const DATA = join(home, 'data', 'pico-desktop', 'apps', 'dev.pico-desktop.drone-configurator')

export const RECORDINGS = join(DATA, 'recordings')

/** The name of a recording that ended: when it started, then its CRC-32. */
const ENDED = /^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d-(?<crc>[0-9a-f]{8})\.tlog$/u

/** A frame of a recording. */
export interface RecordedFrame {
  /** When it was recorded (microseconds since 1970). */
  timeUs: number
  /** The system that sent it. */
  sysid: number
  /** Its message. */
  msgid: number
}

/**
 * The names of the recordings in a folder that ended, oldest first.
 *
 * @param folder the folder
 * @returns their names
 */
export function endedRecordings(folder = RECORDINGS): string[] {
  return existsSync(folder) ? readdirSync(folder).filter(name => ENDED.test(name)).sort() : []
}

/**
 * Whether a recording's bytes have the CRC-32 in its name.
 *
 * @param folder the folder
 * @param name its name
 * @returns true if they do
 */
export function crcMatches(folder: string, name: string): boolean {
  const crc = ENDED.exec(name)?.groups?.crc

  return crc !== undefined && crc32(readFileSync(join(folder, name))) === Number.parseInt(crc, 16)
}

/**
 * A byte of the recording, 0 past its end.
 *
 * @param bytes the recording
 * @param at where
 * @returns the byte
 */
function byteAt(bytes: Uint8Array, at: number): number {
  return bytes[at] ?? 0
}

/** The length of a frame by its first byte (MAVLink 2, MAVLink 1) and its payload's length, and its signature's. */
const FRAME_LENGTHS: Record<number, (length: number, flags: number) => number> = {
  0xFD: (length, flags) => 12 + length + (flags & 1) * 13,
  0xFE: length => 8 + length,
}

/**
 * The length of the MAVLink frame at `at`, or 0 when there is none.
 *
 * @param bytes the recording
 * @param at where the frame starts
 * @returns its length
 */
function frameLength(bytes: Uint8Array, at: number): number {
  const lengthOf = FRAME_LENGTHS[byteAt(bytes, at)]

  return lengthOf ? lengthOf(byteAt(bytes, at + 1), byteAt(bytes, at + 2)) : 0
}

/**
 * One frame of a recording: MAVLink 2 has its system at 5 and its message at 7 to 9, MAVLink 1 at 3 and 5.
 *
 * @param bytes the recording
 * @param at where the frame starts (after its time)
 * @param timeUs its time
 * @returns the frame
 */
function frameAt(bytes: Uint8Array, at: number, timeUs: number): RecordedFrame {
  if (byteAt(bytes, at) === 0xFD) {
    const msgid = byteAt(bytes, at + 7) | (byteAt(bytes, at + 8) << 8) | (byteAt(bytes, at + 9) << 16)

    return { timeUs, sysid: byteAt(bytes, at + 5), msgid }
  }

  return { timeUs, sysid: byteAt(bytes, at + 3), msgid: byteAt(bytes, at + 5) }
}

/**
 * The frames of a recording, in order; it stops at the first record that is not whole.
 *
 * @param path the file
 * @returns the frames
 */
export function framesOf(path: string): RecordedFrame[] {
  const bytes = new Uint8Array(readFileSync(path))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frames: RecordedFrame[] = []
  let at = 0
  while (at + 8 < bytes.length) {
    const length = frameLength(bytes, at + 8)
    if (length === 0 || at + 8 + length > bytes.length) {
      break
    }
    frames.push(frameAt(bytes, at + 8, Number(view.getBigUint64(at))))
    at += 8 + length
  }

  return frames
}
