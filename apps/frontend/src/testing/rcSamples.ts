// What the tests of the mapping read: a pad's sample, and a row on one of its channels.
import { newRow } from '@/lib/rc/suggest'
import { CHANNELS, type PadSample, type Row } from '@/lib/rc/types'

/**
 * What a pad says: these values on CH1 and on, null (a channel the pad has not) for the rest.
 *
 * @param values CH1, CH2 ...
 * @returns the sample
 */
export function sample(...values: (number | null)[]): PadSample {
  return { channels: Array.from({ length: CHANNELS }, (_, index) => values[index] ?? null) }
}

/**
 * A row on channel 3 that reads a pad channel, with no dead zone and no curve, and what is changed of it.
 *
 * @param source the pad channel it reads
 * @param more what differs from the plain row
 * @returns the row
 */
export function plain(source: number, more: Partial<Row> = {}): Row {
  return { ...newRow(3, source), ...more }
}
