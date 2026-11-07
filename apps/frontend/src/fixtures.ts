// The simulated vehicle's data: deterministic, so tests and screenshots are the same every time.
// Names, types and values are like ArduPilot Copter's.
import type { Param, Telemetry } from './generated/app'

export const VEHICLE = { sysid: 1, compid: 1, type: 'QUADROTOR', autopilot: 'ARDUPILOTMEGA' } as const

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

/** Telemetry `n` ticks after connecting: a slow, gentle sway and a draining battery. */
export function telemetryAt(n: number): Telemetry {
  return {
    armed: n >= 3,
    mode: n >= 3 ? 'LOITER' : 'STABILIZE',
    batteryVoltage: Math.round((12.6 - n * 0.01) * 100) / 100,
    batteryRemaining: Math.max(0, 100 - n),
    roll: Math.round(Math.sin(n / 5) * 300) / 100,
    pitch: Math.round(Math.cos(n / 7) * 200) / 100,
    yaw: (n * 3) % 360,
    heartbeatAgeMs: 200,
  }
}
