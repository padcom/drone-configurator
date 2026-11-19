// What turning the RC control on asks the first time in a session: a plain confirmation that says what the pad will do (the
// switch and the palette command ask the same).
import type { VehicleInfo } from '@/generated/app'
import type { SafetyOptions } from '@/lib/app/safety'
import type { ThrottleStyle } from '@/lib/rc/types'

/** A message of the interface. */
export type Say = (key: string, named?: Record<string, unknown>) => string

/**
 * The vehicle as the status bar names it.
 *
 * @param info what the connection says of the vehicle, if there is one
 * @param say the words of the interface
 * @returns its name, or an empty string when none is connected
 */
export function namedVehicleOf(info: VehicleInfo | undefined, say: Say): string {
  return info === undefined ? '' : say('topBar.vehicleValue', { ...info })
}

/**
 * The question of turning the control on.
 *
 * @param say the words of the interface
 * @param vehicle the vehicle it is for, as the status bar says it (empty when none)
 * @param style how the throttle rests in the mapping that will fly, when that is known: it is said in plain words (both are said
 * when it is not known yet: the pad has not been read)
 * @returns what to ask
 */
export function summaryOptions(say: Say, vehicle: string, style: ThrottleStyle | null = null): SafetyOptions {
  return {
    title: say('rc.summary.title'),
    what: `${say('rc.summary.what')} ${say(`rc.summary.${style ?? 'either'}`)}`,
    vehicle,
    level: 'plain',
    tone: 'warn',
    confirmLabel: say('rc.summary.button'),
  }
}
