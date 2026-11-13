// What the Vehicle information page shows of the board: a row for each thing the vehicle said, and none for what it did not (a
// dash would look like a value, and a zero like a fact).
import type { VehicleDetails } from '@/generated/app'

/** A row: what it is (its label is `setup.info.<id>`), its value, and the message that words the value when it is a word. */
export interface InfoRow {
  /** What it is (its label is the message `setup.info.<id>`). */
  id: string
  /** Its value. */
  value: string
  /** The message that words the value, when the value is a word of the interface. */
  valueKey?: string
}

/**
 * A row, or null when there is nothing to show.
 *
 * @param id what it is
 * @param value its value
 * @param valueKey the message that words the value, when it is one
 * @returns the row
 */
function row(id: string, value: string | undefined, valueKey?: string): InfoRow | null {
  return value === undefined || value === '' ? null : { id, value, ...valueKey === undefined ? {} : { valueKey } }
}

/**
 * A number as text.
 *
 * @param value the number
 * @returns its digits, or undefined for no number
 */
function digits(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value)
}

/**
 * A number as hexadecimal text.
 *
 * @param value the number
 * @returns `0x` and its digits, or undefined for no number
 */
function hex(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `0x${value.toString(16)}`
}

/**
 * The rows for what the board said.
 *
 * @param details the vehicle's details
 * @returns the rows, in the order they are shown
 */
export function infoRows(details: VehicleDetails): InfoRow[] {
  const release = details.releaseType
  const rows = [
    row('vehicle', details.vehicle),
    row('autopilot', details.autopilot),
    row('version', details.version),
    row('releaseType', release, release === undefined ? undefined : `setup.info.release.${release}`),
    row('gitHash', details.gitHash),
    row('boardVersion', hex(details.boardVersion)),
    row('vendorId', digits(details.vendorId)),
    row('productId', digits(details.productId)),
    row('uid', details.uid),
  ]

  return rows.filter(one => one !== null)
}
