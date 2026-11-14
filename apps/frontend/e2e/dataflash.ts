// A DataFlash (.BIN) log written by the tests, as ArduPilot writes one: every message is the two bytes 0xA3 0x95, its type, and
// its fields; a message is described by a FMT message (type 128) with its type, length, name, format and labels. Only the field
// kinds the tests need are written: Q (u64), f (float32) and Z (64 characters).

/** A message of a log: its type, name, field format and labels. */
export interface Format {
  /** The type (a number). */
  type: number
  /** The name (4 characters at most). */
  name: string
  /** The kind of each field, one character each. */
  format: string
  /** The names of the fields, with commas. */
  labels: string
}

const HEADER = [0xA3, 0x95]
const FMT_TYPE = 128
/** The bytes of a field of each kind. */
const SIZES: Readonly<Record<string, number>> = { Q: 8, f: 4, Z: 64 }

/**
 * A text in a field of a fixed size, padded with zeros.
 *
 * @param text the text
 * @param size the size of the field
 * @returns its bytes
 */
function fixed(text: string, size: number): Buffer {
  const out = Buffer.alloc(size)
  out.write(text, 'latin1')

  return out
}

/**
 * The bytes of a field.
 *
 * @param kind its kind in the format
 * @param value its value (a number, or text for Z)
 * @returns its bytes
 */
function field(kind: string, value: number | string): Buffer {
  const out = Buffer.alloc(SIZES[kind] ?? 0)
  if (kind === 'Q') {
    out.writeBigUInt64LE(BigInt(Math.round(Number(value))))
  } else if (kind === 'f') {
    out.writeFloatLE(Number(value))
  } else {
    out.write(String(value), 'latin1')
  }

  return out
}

/** A DataFlash log under construction. */
export class DataFlash {
  private readonly parts: Buffer[] = []
  private readonly formats = new Map<number, Format>()

  /**
   * Describes a message (writes its FMT).
   *
   * @param format the message
   */
  define(format: Format): void {
    const length = 3 + [...format.format].reduce((sum, kind) => sum + (SIZES[kind] ?? 0), 0)
    this.formats.set(format.type, format)
    this.parts.push(Buffer.from([...HEADER, FMT_TYPE, format.type, length]))
    this.parts.push(fixed(format.name, 4), fixed(format.format, 16), fixed(format.labels, 64))
  }

  /**
   * Writes a message of a type that was described.
   *
   * @param type its type
   * @param values its values, in the order of its format
   * @throws {Error} for a type that was not described
   */
  add(type: number, values: (number | string)[]): void {
    const format = this.formats.get(type)
    if (format === undefined) {
      throw new Error(`message type ${type} was not described`)
    }
    this.parts.push(Buffer.from([...HEADER, type]), ...[...format.format].map((kind, i) => field(kind, values[i] ?? 0)))
  }

  /**
   * The bytes of the log.
   *
   * @returns the log
   */
  bytes(): Buffer {
    return Buffer.concat(this.parts)
  }
}

/**
 * The CRC-32 that ArduPilot gives for a file (MAVLink FTP CalcFileCRC32): the usual polynomial (reflected 0xEDB88320), but with
 * no inversion at the start and none at the end. The library names a copy by it, and a copy with another one is not verified.
 *
 * @param bytes the file
 * @returns the CRC
 */
export function arduPilotCrc32(bytes: Buffer): number {
  let crc = 0

  for (const byte of bytes) {
    crc ^= byte

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 0 ? crc >>> 1 : (crc >>> 1) ^ 0xEDB88320
    }
  }

  return crc >>> 0
}

/**
 * The name the library gives a copy of a log: the number in eight digits, the CRC-32 of its bytes in hex.
 *
 * @param id the number of the log
 * @param bytes the log
 * @returns the name
 */
export function copyName(id: number, bytes: Buffer): string {
  return `${String(id).padStart(8, '0')}-${arduPilotCrc32(bytes).toString(16).padStart(8, '0')}.BIN`
}

/** The roll rate of a flight of the tests. */
export interface Flight {
  /** Whether the log has RATE messages. */
  rate: boolean
  /** Whether the desired roll rate steps from 0 to 57 deg/s at 10 s (else it stays at 10). */
  step: boolean
}

/**
 * The desired roll rate at a sample of a flight (25 Hz).
 *
 * @param flight what the flight is like
 * @param sample the number of the sample, from 1
 * @returns deg/s
 */
function desiredAt(flight: Flight, sample: number): number {
  if (!flight.step) {
    return 10
  }

  return sample >= 250 ? 57 : 0
}

/**
 * A log of 30 s with RATE at 25 Hz: the desired roll rate is flat or steps from 0 to 57 deg/s at 10 s, and the actual one follows
 * it with a lag of 100 ms (a first-order response: a rise of about 0.22 s and no overshoot).
 *
 * @param flight what the log has
 * @returns the log
 */
export function flightLog(flight: Flight): Buffer {
  const log = new DataFlash()
  log.define({ type: 59, name: 'MSG', format: 'QZ', labels: 'TimeUS,Message' })
  log.define({ type: 72, name: 'ATT', format: 'Qff', labels: 'TimeUS,Roll,Pitch' })
  log.define({ type: 73, name: 'RATE', format: 'Qffffff', labels: 'TimeUS,RDes,R,PDes,P,YDes,Y' })
  log.add(59, [1000, 'ArduCopter V4.7.2'])
  let actual = desiredAt(flight, 1)

  for (let i = 1; i <= 750; i += 1) {
    const wanted = desiredAt(flight, i)
    actual += (wanted - actual) * (1 - Math.exp(-0.4))
    log.add(72, [i * 40_000, 1, 0.5])

    if (flight.rate) {
      log.add(73, [i * 40_000, wanted, actual, 0, 0, 0, 0])
    }
  }

  return log.bytes()
}
