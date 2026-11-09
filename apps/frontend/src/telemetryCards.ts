// What the telemetry cards say, from a Telemetry alone (no DOM). Vue's templates escape the text.
import type { Telemetry } from './generated/app'

/** One card: a label, its value, and whether to draw attention to it. */
export interface Card {
  /** What the value is. */
  label: string
  /** The value, already formatted. */
  value: string
  /** True for a state worth noticing (armed, a stale heartbeat). */
  warn: boolean
}

// What the vehicle hasn't reported is a dash, never a made-up zero.
const MISSING = '—'

/**
 * The battery card's text.
 *
 * @param t the telemetry
 * @returns voltage and remaining charge, or a dash
 */
export function batteryText(t: Telemetry): string {
  if (t.batteryVoltage === undefined) {
    return MISSING
  }
  const remaining = t.batteryRemaining === undefined ? '' : ` · ${t.batteryRemaining}%`

  return `${t.batteryVoltage.toFixed(2)} V${remaining}`
}

/**
 * The attitude card's text.
 *
 * @param t the telemetry
 * @returns roll, pitch and yaw, or a dash until all three are known
 */
export function attitudeText(t: Telemetry): string {
  const { roll, pitch, yaw } = t
  if (roll === undefined || pitch === undefined || yaw === undefined) {
    return MISSING
  }

  return `roll ${roll.toFixed(1)}° · pitch ${pitch.toFixed(1)}° · yaw ${yaw.toFixed(0)}°`
}

/**
 * Heartbeat, mode, armed state, battery and attitude as cards.
 *
 * @param t the telemetry
 * @returns the cards, in display order
 */
export function cardsFor(t: Telemetry): Card[] {
  return [
    { label: 'Mode', value: t.mode, warn: false },
    { label: 'State', value: t.armed ? 'ARMED' : 'disarmed', warn: t.armed },
    { label: 'Battery', value: batteryText(t), warn: false },
    { label: 'Attitude', value: attitudeText(t), warn: false },
    { label: 'Heartbeat', value: `${t.heartbeatAgeMs} ms ago`, warn: t.heartbeatAgeMs > 3000 },
  ]
}
