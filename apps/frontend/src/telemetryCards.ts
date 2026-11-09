// What the telemetry cards say, from a Telemetry alone (no DOM). Vue's templates escape the text; the words come
// from the translations and the numbers from the formatters.
import type { Telemetry } from './generated/app'
import type { Format } from './useFormat'

/** Looks up a message, with named values (what `useI18n().t` does). */
export type Translate = (key: string, named?: Record<string, unknown>) => string

/** One card: a label, its value, and whether to draw attention to it. */
export interface Card {
  /** What the value is. */
  label: string
  /** The value, already formatted. */
  value: string
  /** True for a state worth noticing (armed, a stale heartbeat). */
  warn: boolean
}

/**
 * The battery card's text.
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns voltage and remaining charge, or a dash (what the vehicle hasn't reported is never a made-up zero)
 */
export function batteryText(t: Telemetry, translate: Translate, format: Format): string {
  if (t.batteryVoltage === undefined) {
    return translate('telemetry.missing')
  }
  const voltage = format.number(t.batteryVoltage, 2)

  return t.batteryRemaining === undefined
    ? translate('telemetry.value.voltage', { voltage })
    : translate('telemetry.value.voltageAndCharge', { voltage, percent: format.number(t.batteryRemaining) })
}

/**
 * The attitude card's text.
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns roll, pitch and yaw, or a dash until all three are known
 */
export function attitudeText(t: Telemetry, translate: Translate, format: Format): string {
  const { roll, pitch, yaw } = t
  if (roll === undefined || pitch === undefined || yaw === undefined) {
    return translate('telemetry.missing')
  }

  return translate('telemetry.value.attitude', {
    roll: format.number(roll, 1),
    pitch: format.number(pitch, 1),
    yaw: format.number(yaw),
  })
}

/**
 * Heartbeat, mode, armed state, battery and attitude as cards.
 *
 * @param t the telemetry
 * @param translate looks up a message
 * @param format formats numbers
 * @returns the cards, in display order
 */
export function cardsFor(t: Telemetry, translate: Translate, format: Format): Card[] {
  return [
    { label: translate('telemetry.card.mode'), value: t.mode, warn: false },
    {
      label: translate('telemetry.card.state'),
      value: translate(t.armed ? 'telemetry.armed' : 'telemetry.disarmed'),
      warn: t.armed,
    },
    { label: translate('telemetry.card.battery'), value: batteryText(t, translate, format), warn: false },
    { label: translate('telemetry.card.attitude'), value: attitudeText(t, translate, format), warn: false },
    {
      label: translate('telemetry.card.heartbeat'),
      value: translate('telemetry.value.heartbeatAge', { ms: t.heartbeatAgeMs }),
      warn: t.heartbeatAgeMs > 3000,
    },
  ]
}
