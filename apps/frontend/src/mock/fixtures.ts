// The simulated vehicle's data: deterministic, so tests and screenshots are the same every time.
// Names, types and values are like ArduPilot Copter's.
import type { Param, Telemetry } from '@/generated/app'

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
 * A Copter that was set up, as far as the Setup pages can see: the usual parameters and those of its frame, accelerometer,
 * compass, radio, flight modes, failsafes and battery (the values of a vehicle that was calibrated, a mode switch on channel 5).
 */
export const SETUP_PARAMS: Param[] = [
  ...PARAMS.filter(param => !['BATT_CAPACITY', 'BATT_LOW_VOLT', 'FS_THR_ENABLE'].includes(param.id)),
  p('FRAME_CLASS', 'int', 'INT8', 1),
  p('FRAME_TYPE', 'int', 'INT8', 1),
  p('INS_ACCOFFS_X', 'real', 'REAL32', 0.12),
  p('INS_ACCOFFS_Y', 'real', 'REAL32', -0.03),
  p('INS_ACCOFFS_Z', 'real', 'REAL32', 0.2),
  p('INS_ACCSCAL_X', 'real', 'REAL32', 1.001),
  p('INS_ACCSCAL_Y', 'real', 'REAL32', 0.999),
  p('INS_ACCSCAL_Z', 'real', 'REAL32', 1),
  p('COMPASS_OFS_X', 'real', 'REAL32', 14),
  p('COMPASS_OFS_Y', 'real', 'REAL32', -8),
  p('COMPASS_OFS_Z', 'real', 'REAL32', 31),
  ...[1, 2, 3, 4].flatMap(n => [p(`RC${n}_MIN`, 'int', 'INT16', 1008), p(`RC${n}_MAX`, 'int', 'INT16', 1992)]),
  p('MOT_PWM_TYPE', 'int', 'INT8', 0),
  p('MOT_SPIN_ARM', 'real', 'REAL32', 0.1),
  p('MOT_SPIN_MIN', 'real', 'REAL32', 0.15),
  p('MOT_SPIN_MAX', 'real', 'REAL32', 0.95),
  p('FLTMODE1', 'int', 'INT8', 0),
  p('FLTMODE2', 'int', 'INT8', 5),
  p('FLTMODE3', 'int', 'INT8', 6),
  p('FLTMODE4', 'int', 'INT8', 3),
  p('FLTMODE5', 'int', 'INT8', 9),
  p('FLTMODE6', 'int', 'INT8', 16),
  p('FLTMODE_CH', 'int', 'INT8', 5),
  p('FS_THR_ENABLE', 'int', 'INT8', 1),
  p('FS_GCS_ENABLE', 'int', 'INT8', 0),
  p('FS_EKF_ACTION', 'int', 'INT8', 1),
  p('BATT_MONITOR', 'int', 'INT8', 4),
  p('BATT_CAPACITY', 'int', 'INT32', 5200),
  p('BATT_LOW_VOLT', 'real', 'REAL32', 10.5),
  p('BATT_CRT_VOLT', 'real', 'REAL32', 10),
  p('BATT_FS_LOW_ACT', 'int', 'INT8', 2),
  p('BATT_FS_CRT_ACT', 'int', 'INT8', 1),
  p('BATT_VOLT_MULT', 'real', 'REAL32', 10.1),
  p('BATT_AMP_PERVLT', 'real', 'REAL32', 17),
  p('AHRS_ORIENTATION', 'int', 'INT8', 0),
  p('SERIAL0_PROTOCOL', 'int', 'INT8', 2),
  p('SERIAL0_BAUD', 'int', 'INT32', 115),
  p('SERIAL1_PROTOCOL', 'int', 'INT8', 2),
  p('SERIAL1_BAUD', 'int', 'INT32', 57),
  p('SERIAL2_PROTOCOL', 'int', 'INT8', 5),
  p('SERIAL2_BAUD', 'int', 'INT32', 115),
  p('SERIAL3_PROTOCOL', 'int', 'INT8', -1),
  p('SERIAL3_BAUD', 'int', 'INT32', 38),
  // Device ids: an I2C compass (bus 1, address 0x1e, type 7), an SPI accelerometer and gyro (bus 0, addresses 1 and 2, type 9),
  // an SPI barometer (address 3, type 11); the second accelerometer was never seen.
  p('COMPASS_DEV_ID', 'int', 'INT32', 466_441),
  p('INS_ACC_ID', 'int', 'INT32', 590_082),
  p('INS_ACC2_ID', 'int', 'INT32', 0),
  p('INS_GYR_ID', 'int', 'INT32', 590_338),
  p('BARO1_DEVID', 'int', 'INT32', 721_666),
].map((param, index) => ({ ...param, index }))

/** What the simulated vehicle says of itself (AUTOPILOT_VERSION and SYS_STATUS) when asked by `vehicle.info`. */
export const VEHICLE_DETAILS = {
  vehicle: 'QUADROTOR',
  autopilot: 'ARDUPILOTMEGA',
  version: '4.6.2',
  releaseType: 'official',
  gitHash: 'a1b2c3d4',
  boardVersion: 1_000_000,
  vendorId: 9900,
  productId: 17,
  uid: '1.18.52.86.120.154.188.222',
  sensors: [
    { id: 'gyro', present: true, enabled: true, healthy: true },
    { id: 'accel', present: true, enabled: true, healthy: true },
    { id: 'mag', present: true, enabled: true, healthy: false },
    { id: 'baro', present: true, enabled: true, healthy: true },
    { id: 'gps', present: true, enabled: true, healthy: true },
  ],
} as const

/** The modes of a Copter, by their number in `custom_mode` (the names are the dialect's). */
export const COPTER_MODES = [
  [0, 'STABILIZE'],
  [1, 'ACRO'],
  [2, 'ALT_HOLD'],
  [3, 'AUTO'],
  [4, 'GUIDED'],
  [5, 'LOITER'],
  [6, 'RTL'],
  [7, 'CIRCLE'],
  [9, 'LAND'],
  [11, 'DRIFT'],
  [13, 'SPORT'],
  [14, 'FLIP'],
  [15, 'AUTOTUNE'],
  [16, 'POSHOLD'],
  [17, 'BRAKE'],
  [18, 'THROW'],
  [21, 'SMART_RTL'],
].map(([number, name]) => ({ number: number as number, name: name as string }))

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
): Pick<Telemetry, 'position' | 'gps' | 'speed' | 'battery' | 'attitude' | 'rc' | 'servo'> {
  const ageMs = 200

  return {
    // The four motors of a quad: at rest, and a little above once the vehicle is armed.
    servo: { ports: [{ port: 0, outputs: n >= 3 ? [1100, 1100, 1100, 1100] : [1000, 1000, 1000, 1000] }], ageMs },
    // Eight channels: the sticks sway a little round the middle, the throttle low, the switches at rest (low).
    rc: { channels: [1500 + (n % 5) * 20, 1500, 1000, 1500 - (n % 3) * 10, 1000, 1000, 1500, 1000], rssi: 87, ageMs },
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
