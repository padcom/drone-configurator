// The battery page's numbers. The monitor choices are ArduPilot's own (libraries/AP_BattMonitor/AP_BattMonitor_Params.cpp
// lines 21 to 56: a value that has no name here is shown as its number). The calibration follows from what the parameters
// mean (libraries/AP_BattMonitor/AP_BattMonitor_Analog.cpp lines 76 to 87): the vehicle's voltage is `pin voltage *
// BATT_VOLT_MULT`, and its current is `(pin voltage - offset) * BATT_AMP_PERVLT`, so a reading that is a factor off is put
// right by that factor: the new multiplier is the old one times what a meter measures over what the vehicle shows. The page
// proposes it; the user writes it.

/** The batteries the page has a tab for: the parameter prefix of each. */
export const BATTERY_PREFIXES: readonly string[] = ['BATT', 'BATT2']

/** How far (as a fraction of what the vehicle shows) a meter may differ before the page asks for a second look at the reading. */
export const SECOND_LOOK = 0.15

/** The monitor choices that have a name here: the value, and the name of its words (`setup.monitor.<name>`). */
export const MONITORS: readonly { value: number, name: string }[] = [
  { value: 0, name: 'disabled' },
  { value: 3, name: 'analogVoltage' },
  { value: 4, name: 'analogVoltageCurrent' },
  { value: 7, name: 'smbus' },
  { value: 8, name: 'dronecan' },
  { value: 9, name: 'esc' },
  { value: 10, name: 'sum' },
  { value: 25, name: 'syntheticCurrent' },
  { value: 31, name: 'analogCurrent' },
]

/**
 * The parameters of one battery.
 *
 * @param index the battery, 0 for the first
 * @returns the monitor, the capacity, the voltage multiplier and the amps per volt
 */
export function batteryParams(index: number): string[] {
  const prefix = BATTERY_PREFIXES[index] ?? 'BATT'

  return ['MONITOR', 'CAPACITY', 'VOLT_MULT', 'AMP_PERVLT'].map(name => `${prefix}_${name}`)
}

/**
 * A number as typed: a number that is not negative.
 *
 * @param text what was typed
 * @returns the number, or null when it is not one
 */
export function parseAmount(text: string): number | null {
  const value = Number(text)

  return text.trim() !== '' && Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Round to three decimals (what the vehicle's float shows of a multiplier).
 *
 * @param value the number
 * @returns the rounded number
 */
function rounded(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * The value a calibration proposes: the old multiplier (or amps per volt) times what the meter says over what the vehicle shows.
 *
 * @param current the parameter now
 * @param measured what the meter says
 * @param shown what the vehicle shows
 * @returns the new value, or null when nothing can be worked out (no reading, nothing shown, or a parameter that is 0)
 */
export function calibrated(current: number, measured: number, shown: number): number | null {
  const usable = current > 0 && measured > 0 && shown > 0

  return usable ? rounded(current * measured / shown) : null
}

/**
 * Whether the meter is so far from what the vehicle shows that the reading needs a second look (more than `SECOND_LOOK`).
 *
 * @param measured what the meter says
 * @param shown what the vehicle shows
 * @returns true when it is
 */
export function needsSecondLook(measured: number, shown: number): boolean {
  return shown > 0 && Math.abs(measured - shown) / shown > SECOND_LOOK
}
