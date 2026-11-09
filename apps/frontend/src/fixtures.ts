// The simulated vehicle's data: deterministic, so tests and screenshots are the same every time.
// Names, types and values are like ArduPilot Copter's.
import type { Param, Telemetry } from './generated/app'

export const VEHICLE = { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' } as const

/** The mock machine's serial ports: a flight controller on USB, and a plain UART. */
/** What the simulated vehicle says when it connects (MAVLink severity, text): a boot banner, a warning, a long text. */
export const SCRIPTED_MESSAGES: readonly (readonly [number, string])[] = [
  [6, 'ArduCopter V4.5.7 (mock)'],
  [4, 'PreArm: Compass not calibrated'],
  [6, 'Frame: QUAD/X, with a text that is long enough to be sent in several chunks by a real vehicle, as a banner is'],
]

export const SERIAL_PORTS = [
  { path: '/dev/ttyACM0', description: 'USB 1209:5741 ArduPilot' },
  { path: '/dev/ttyAMA0' },
]

const p = (id: string, kind: Param['kind'], type: string, value: number): Omit<Param, 'index'> => ({ id, kind, type, value })

export const PARAMS: Param[] = [
  p('ARMING_CHECK', 'int', 'INT32', 1),
  p('BATT_CAPACITY', 'int', 'INT32', 5200),
  p('BATT_LOW_VOLT', 'real', 'REAL32', 10.5),
  p('FENCE_ENABLE', 'int', 'INT8', 0),
  p('FENCE_RADIUS', 'real', 'REAL32', 150),
  p('FS_THR_ENABLE', 'int', 'INT8', 1),
  p('LOIT_SPEED', 'real', 'REAL32', 1250),
  p('PILOT_SPEED_UP', 'int', 'INT16', 250),
  p('RTL_ALT', 'int', 'INT32', 1500),
  p('SERIAL0_BAUD', 'int', 'INT32', 115),
  p('SYSID_THISMAV', 'int', 'INT16', 1),
  p('WPNAV_SPEED', 'real', 'REAL32', 1000),
].map((param, index) => ({ ...param, index }))

/**
 * The groups the simulated vehicle reports `n` ticks after connecting: the same battery and attitude as the flat
 * fields, a position that drifts north, a 3D GPS fix and a speed. Every group is 200 ms old.
 *
 * @param n how many ticks (seconds) after connecting
 * @param flat the flat fields the battery and attitude groups repeat
 * @param flat.batteryVoltage volts
 * @param flat.batteryRemaining percent
 * @param flat.roll degrees
 * @param flat.pitch degrees
 * @param flat.yaw degrees
 * @returns the groups
 */
function groupsAt(
  n: number,
  flat: { batteryVoltage: number, batteryRemaining: number, roll: number, pitch: number, yaw: number },
): Pick<Telemetry, 'position' | 'gps' | 'speed' | 'battery' | 'attitude'> {
  const ageMs = 200

  return {
    battery: { voltage: flat.batteryVoltage, remaining: flat.batteryRemaining, cells: [4.19, 4.2, 4.21], ageMs },
    attitude: { roll: flat.roll, pitch: flat.pitch, yaw: flat.yaw, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0, ageMs },
    position: {
      lat: 47.397742 + (n * 0.00001),
      lon: 8.545594,
      altitude: 488,
      relativeAltitude: n >= 3 ? 20 : 0,
      vx: 1,
      vy: 0,
      vz: 0,
      ageMs,
    },
    gps: { fixType: 3, satellites: 12, hdop: 0.9, ageMs },
    speed: { airspeed: 1.2, groundspeed: 1, climb: 0, throttle: 40, heading: flat.yaw, ageMs },
  }
}

/**
 * Telemetry `n` ticks after connecting: a slow, gentle sway and a draining battery, with the groups a vehicle
 * that streams everything would send.
 *
 * @param n how many ticks (seconds) after connecting
 * @returns what the simulated vehicle reports then
 */
export function telemetryAt(n: number): Telemetry {
  const batteryVoltage = Math.round((12.6 - n * 0.01) * 100) / 100
  const batteryRemaining = Math.max(0, 100 - n)
  const roll = Math.round(Math.sin(n / 5) * 300) / 100
  const pitch = Math.round(Math.cos(n / 7) * 200) / 100
  const yaw = (n * 3) % 360

  return {
    armed: n >= 3,
    mode: n >= 3 ? 'LOITER' : 'STABILIZE',
    batteryVoltage,
    batteryRemaining,
    roll,
    pitch,
    yaw,
    heartbeatAgeMs: 200,
    ...groupsAt(n, { batteryVoltage, batteryRemaining, roll, pitch, yaw }),
  }
}
