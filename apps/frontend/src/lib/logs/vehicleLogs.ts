// What the "On the vehicle" list works out from the logs and their progress. Pure, so that the rules of the safety register
// (no download or erase while armed, or while it is not known that the vehicle is disarmed) are tested without a component.
import type { LogsProgress, VehicleLog } from '@/generated/app'

/** Why the vehicle's logs cannot be downloaded or erased now; null when they can. */
export type Blocked = 'offline' | 'armed' | 'unknown' | 'busy' | null

/** How a log is doing, for its row: not fetched yet (`new`), fetched and checked (`downloaded`), or what the download says. */
export type LogState = 'new' | 'unchecked' | 'downloaded' | 'queued' | 'downloading' | 'done' | 'failed'

/**
 * What the armed state alone says about it: not known counts as armed, with its own reason.
 *
 * @param armed whether the vehicle is armed; undefined when that is not known
 * @returns the reason, or null for a vehicle that is known to be disarmed
 */
function armedBlock(armed: boolean | undefined): Blocked {
  if (armed === undefined) {
    return 'unknown'
  }

  return armed ? 'armed' : null
}

/**
 * Whether the logs can be downloaded or erased, and if not, why. A vehicle that is not known to be disarmed counts as armed.
 *
 * @param connected whether a vehicle is connected
 * @param armed whether it is armed; undefined when that is not known
 * @param running whether a download is under way
 * @returns the reason, or null
 */
export function blockedBy(connected: boolean, armed: boolean | undefined, running: boolean): Blocked {
  if (!connected) {
    return 'offline'
  }

  return armedBlock(armed) ?? (running ? 'busy' : null)
}

/**
 * What a log's row says about it.
 *
 * @param log the log
 * @param progress what the download said of it last, if it did
 * @returns the state
 */
export function stateOf(log: VehicleLog, progress: LogsProgress | undefined): LogState {
  if (progress) {
    return progress.state
  }

  if (log.downloaded) {
    return 'downloaded'
  }

  // A copy of its number and size is here, but the vehicle's CRC could not be asked (armed, a limit of time): the next list says.
  return log.unchecked ? 'unchecked' : 'new'
}

/**
 * The logs that are not on this computer (what an erase would leave, and what a download is for).
 *
 * @param logs the logs
 * @returns the ids of those not downloaded
 */
export function undownloadedIds(logs: VehicleLog[]): number[] {
  return logs.filter(log => !log.downloaded).map(log => log.id)
}

/**
 * How much the listed logs take on the vehicle. It is the sum of the sizes listed: the vehicle does not say how much room it
 * has, and this is never shown as a part of a total.
 *
 * @param logs the logs
 * @returns bytes
 */
export function usedBytes(logs: VehicleLog[]): number {
  return logs.reduce((sum, log) => sum + log.size, 0)
}

const UNITS = ['B', 'kB', 'MB', 'GB']

/**
 * How many decimals a size takes: one for a small number of a unit (1.2 MB), none for a whole one or a large one (48 kB, 3 MB).
 *
 * @param value the number of the unit
 * @param unit the index of the unit (0 is bytes)
 * @returns 0 or 1
 */
function decimalsOf(value: number, unit: number): number {
  return unit === 0 || value >= 100 || Number.isInteger(Math.round(value * 10) / 10) ? 0 : 1
}

/**
 * A size for people: 1.2 MB, 48 kB, 12 B.
 *
 * @param bytes the size
 * @param number writes a number with a given count of decimals in the language of the interface (`useFormat().number`)
 * @returns the text
 */
export function sizeText(bytes: number, number: (value: number, digits: number) => string): string {
  const unit = Math.min(UNITS.length - 1, Math.max(0, Math.floor(Math.log10(Math.max(1, bytes)) / 3)))
  const value = bytes / 1000 ** unit

  return `${number(value, decimalsOf(value, unit))} ${UNITS[unit]}`
}

/**
 * How far a log's download is, as a whole percent (0 for a log of no size).
 *
 * @param progress what the download said of the log
 * @returns 0 to 100
 */
export function percentOf(progress: LogsProgress | undefined): number {
  if (!progress || progress.total <= 0) {
    return 0
  }

  return Math.min(100, Math.floor(progress.received * 100 / progress.total))
}

/**
 * The time a log was made, or null when the vehicle gave none.
 *
 * @param log the log
 * @returns the date
 */
export function madeAt(log: VehicleLog): Date | null {
  return log.time === undefined ? null : new Date(Number(log.time))
}
