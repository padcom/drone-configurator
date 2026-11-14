// Raw IMU batches (ArduPilot's ISBH and ISBD) in a log written by the tests, and the INS_LOG_BAT_OPT that says which of them are
// before the vehicle's filters and which after: a gyro that shakes at 150 Hz (a tone of the amplitude given) in 2 batches of 1024
// samples at 1000 Hz.
import { DataFlash } from './dataflash'

/** A gyro the log has batches of. */
export interface GyroBatches {
  /** The instance in ISBH (the IMU's, or the IMU's plus the number of IMUs for data after the filters). */
  instance: number
  /** The amplitude of the 150 Hz tone (rad/s). */
  amplitude: number
}

const SAMPLES = 1024
const RATE_HZ = 1000
const MULTIPLIER = 100
const ZEROS = new Array<number>(32).fill(0)

/**
 * 32 samples of the tone, as whole counts of 1 / MULTIPLIER (what the log stores).
 *
 * @param amplitude the amplitude of the tone
 * @param piece which 32 samples of the batch
 * @returns the samples
 */
function samples(amplitude: number, piece: number): number[] {
  const tone = (i: number) => Math.sin((2 * Math.PI * 150 * (piece * 32 + i)) / RATE_HZ)

  return Array.from({ length: 32 }, (_, i) => Math.round(MULTIPLIER * amplitude * tone(i)))
}

/**
 * One batch of a gyro: an ISBH and its ISBD.
 *
 * @param log the log
 * @param n the number of the batch
 * @param gyro the gyro
 */
function addBatch(log: DataFlash, n: number, gyro: GyroBatches): void {
  const at = 1_000_000 * n
  log.add(150, [at, n, 1, gyro.instance, MULTIPLIER, SAMPLES, at, RATE_HZ])

  for (let piece = 0; piece < SAMPLES / 32; piece += 1) {
    log.add(151, [at + piece, n, piece, samples(gyro.amplitude, piece), ZEROS, ZEROS])
  }
}

/**
 * A log with the batches of some gyros, and the PARM of INS_LOG_BAT_OPT when `option` is given.
 *
 * @param option the value of INS_LOG_BAT_OPT, or undefined for a log that has none
 * @param gyros the gyros
 * @returns the log
 */
export function batchLog(option: number | undefined, gyros: GyroBatches[]): Buffer {
  const log = new DataFlash()
  log.define({ type: 59, name: 'MSG', format: 'QZ', labels: 'TimeUS,Message' })
  log.define({ type: 70, name: 'PARM', format: 'QNff', labels: 'TimeUS,Name,Value,Default' })
  log.define({ type: 150, name: 'ISBH', format: 'QHBBHHQf', labels: 'TimeUS,N,type,instance,mul,smp_cnt,SampleUS,smp_rate' })
  log.define({ type: 151, name: 'ISBD', format: 'QHHaaa', labels: 'TimeUS,N,seqno,x,y,z' })
  log.add(59, [1000, 'ArduCopter V4.7.2'])

  if (option !== undefined) {
    log.add(70, [1500, 'INS_LOG_BAT_OPT', option, 0])
  }
  gyros.forEach((gyro, i) => {
    addBatch(log, 2 * i + 1, gyro)
    addBatch(log, 2 * i + 2, gyro)
  })

  return log.bytes()
}
