// Which vehicles the Setup pages are for. Copter comes first: its multirotor frames. A helicopter is a copter to ArduPilot but
// has other pages (swashplate, rotor), a plane, a rover and a sub have theirs: they are "not available yet", not wrong pages.

/** The vehicle types (MAV_TYPE names) the Setup pages are built for: a multicopter of any number of rotors. */
const COPTER_TYPES: readonly string[] = [
  'QUADROTOR', 'HEXAROTOR', 'OCTOROTOR', 'TRICOPTER', 'COAXIAL', 'DECAROTOR', 'DODECAROTOR',
]

/**
 * Whether the Setup pages are for this vehicle.
 *
 * @param type the vehicle's type as the connection says it (`QUADROTOR`), or undefined for no vehicle
 * @returns true for a multicopter
 */
export function isMulticopter(type: string | undefined): boolean {
  return type !== undefined && COPTER_TYPES.includes(type)
}
