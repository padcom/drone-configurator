// What is shared by the parts of the interface that tell the vehicle's telemetry (the top bar, the display, the cards of the
// Fly aside), from a Telemetry alone (no DOM): when a value is too old, and the battery's words. Vue's templates escape the
// text; the words come from the translations and the numbers from the formatters.
import type { Telemetry } from './generated/app'
import type { Format } from './useFormat'

/** Looks up a message, with named values (what `useI18n().t` does). */
export type Translate = (key: string, named?: Record<string, unknown>) => string

/** How old a value may be before it is called stale: messages come at 1 Hz or faster, so three missed ones. */
export const STALE_MS = 3000

/**
 * Whether a value that arrived `ageMs` ago is too old to trust.
 *
 * @param ageMs how long ago it arrived
 * @param thresholdMs the age above which it is stale
 * @returns true when it is stale
 */
export function isStale(ageMs: number, thresholdMs = STALE_MS): boolean {
  return ageMs > thresholdMs
}

/**
 * The battery values: the battery group when the vehicle sent it, else the flat fields.
 *
 * @param t the telemetry
 * @returns voltage and percent remaining, each absent when unknown
 */
const batteryOf = (t: Telemetry) => t.battery ?? { voltage: t.batteryVoltage, remaining: t.batteryRemaining }

/**
 * The battery's words.
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns voltage and remaining charge, or a dash (what the vehicle hasn't reported is never a made-up zero)
 */
export function batteryText(t: Telemetry, translate: Translate, format: Format): string {
  const { voltage: volts, remaining } = batteryOf(t)
  if (volts === undefined) {
    return translate('telemetry.missing')
  }
  const voltage = format.number(volts, 2)

  return remaining === undefined
    ? translate('telemetry.value.voltage', { voltage })
    : translate('telemetry.value.voltageAndCharge', { voltage, percent: format.number(remaining) })
}
