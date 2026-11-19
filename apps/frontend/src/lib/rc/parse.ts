// Reading what the settings hold: nothing that comes back is trusted, so these are the checks the readers of a mapping share.
import { validChannel } from './mapping'

/** What a value that was read is, before it is known to be anything. */
export type Record_ = Record<string, unknown>

/**
 * Whether a value is an object.
 *
 * @param value the value
 * @returns true when it is, and not an array or null
 */
export function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is a number that is a number.
 *
 * @param value the value
 * @returns true for a finite number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Whether the named members of a record are all numbers.
 *
 * @param v the record
 * @param keys the names
 * @returns true when they are
 */
export function numbers(v: Record_, keys: readonly string[]): boolean {
  return keys.every(key => isNumber(v[key]))
}

/**
 * Whether a value is a record with a channel of an override.
 *
 * @param value what was read
 * @returns true when it is
 */
export function hasChannel(value: unknown): value is Record_ {
  return isRecord(value) && isNumber(value.channel) && validChannel(value.channel)
}
