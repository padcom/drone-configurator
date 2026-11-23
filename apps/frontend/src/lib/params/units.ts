// How a parameter's unit is shown: ArduPilot stores many values in small units (centimetres, centidegrees) and the
// metadata names them so ("cm", "cdeg"); a person reads metres and degrees. A unit that has a better one to show is
// converted for display and back when a value is typed; every other unit is shown as the metadata says it. The vehicle
// always holds, and the app always sends, the stored value: only what is on the screen is converted.

/** How a unit is shown. */
export interface UnitView {
  /** The unit that is drawn after the value. */
  unit: string
  /** What the stored value is multiplied by to get the shown one (0.01 for centimetres shown as metres). */
  scale: number
  /** How many decimals the shown value has at most (undefined: as many as the number needs). */
  decimals?: number
}

/** The units that are shown as another, by the metadata's name for them. */
const VIEWS: Record<string, UnitView> = {
  'cm': { unit: 'm', scale: 0.01, decimals: 2 },
  'cm/s': { unit: 'm/s', scale: 0.01, decimals: 2 },
  'cm/s/s': { unit: 'm/s²', scale: 0.01, decimals: 2 },
  'cdeg': { unit: '°', scale: 0.01, decimals: 2 },
  'cdeg/s': { unit: '°/s', scale: 0.01, decimals: 2 },
  'cdeg/s/s': { unit: '°/s²', scale: 0.01, decimals: 2 },
}

/** The digits a converted number keeps, so that a float's noise (0.1 + 0.2) is not shown or sent. */
const SIGNIFICANT = 12

/**
 * How a unit is shown.
 *
 * @param unit the unit the metadata names (none: undefined)
 * @returns how to show it: converted when the table has a better unit for it, else as it is
 */
export function viewOf(unit: string | undefined): UnitView {
  return (unit === undefined ? undefined : VIEWS[unit]) ?? { unit: unit ?? '', scale: 1 }
}

/**
 * The value to show for a stored one.
 *
 * @param stored the stored value
 * @param view how the unit is shown
 * @returns the shown value
 */
export function toDisplay(stored: number, view: UnitView): number {
  return Number((stored * view.scale).toPrecision(SIGNIFICANT))
}

/**
 * The stored value for a shown (typed) one.
 *
 * @param shown the shown value
 * @param view how the unit is shown
 * @returns the stored value
 */
export function toStored(shown: number, view: UnitView): number {
  return Number((shown / view.scale).toPrecision(SIGNIFICANT))
}

/**
 * A shown value as text: to the unit's decimals at most, and without the zeros that end them.
 *
 * @param shown the shown value
 * @param view how the unit is shown
 * @returns the text
 */
export function shownText(shown: number, view: UnitView): string {
  return String(view.decimals === undefined ? shown : Number(shown.toFixed(view.decimals)))
}
