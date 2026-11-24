// The serial bridge (#198) as the Setup page and the top bar show it: the vehicle's ports by their names, the speeds that can be
// asked for, the local port as typed, and what each refusal and each end means for the person (as message keys).
import type { SerialBridgeDevice, SerialBridgeState } from '@/generated/app'

/** The vehicle's ports a bridge can take, in the order of the list: SERIAL_CONTROL_DEV's own. */
export const BRIDGE_DEVICES: readonly SerialBridgeDevice[] = [
  'GPS1',
  'GPS2',
  'TELEM1',
  'TELEM2',
  'SERIAL0',
  'SERIAL1',
  'SERIAL2',
  'SERIAL3',
  'SERIAL4',
  'SERIAL5',
  'SERIAL6',
  'SERIAL7',
  'SERIAL8',
  'SERIAL9',
]

/** A bridge that is off and never ran: what is shown before the backend has said. */
export const BRIDGE_OFF: SerialBridgeState = { state: 'off', client: false, toVehicle: 0, fromVehicle: 0, dropped: 0, refused: 0 }

/** The speeds that can be asked for (bits a second); 0 leaves the port's speed as it is. */
export const BRIDGE_BAUDS: readonly number[] = [0, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

/** The local TCP port offered at first. */
export const DEFAULT_LOCAL_PORT = '5770'

/** A port's name as a message key and what fills it. */
export interface DeviceName {
  /** The message. */
  key: string
  /** What fills it. */
  params: Record<string, number>
}

/**
 * The name of a port of the vehicle.
 *
 * @param device the port, as SERIAL_CONTROL_DEV names it
 * @returns the message that names it: "GPS 1", "Telemetry 2", "Serial 4"
 */
export function deviceName(device: SerialBridgeDevice): DeviceName {
  const kind = device.replace(/\d+$/u, '')

  return { key: `setup.bridge.name.${kind.toLowerCase()}`, params: { n: Number(device.slice(kind.length)) } }
}

/**
 * A port number as typed.
 *
 * @param text what was typed, not empty
 * @returns the port, or null when it is not a whole number from 1 to 65535
 */
function wholePort(text: string): number | null {
  const port = /^\d{1,5}$/u.test(text) ? Number(text) : 0

  return port >= 1 && port <= 65535 ? port : null
}

/**
 * The local port as typed: empty is any free port (0), else a whole number from 1 to 65535.
 *
 * @param text what was typed
 * @returns the port, or null when it is not one
 */
export function localPortOf(text: string): number | null {
  const trimmed = text.trim()

  return trimmed === '' ? 0 : wholePort(trimmed)
}

/** The codes the backend refuses a start with, that have words of their own. */
const REFUSALS = new Set(['ARMED', 'STATE_UNKNOWN', 'NOT_CONNECTED', 'BUSY', 'PORT_UNAVAILABLE', 'INVALID_VALUE'])

/**
 * The message for a start that was refused.
 *
 * @param code the backend's code
 * @returns the message key
 */
export function refusalKey(code: string): string {
  return `setup.bridge.refused.${REFUSALS.has(code) ? code : 'other'}`
}

/** The reasons a bridge ends, that have words of their own. */
const ENDINGS = new Set(['STOPPED', 'DISCONNECTED', 'LINK_LOST', 'ARMED', 'LISTEN_FAILED'])

/**
 * The message for how the last bridge ended.
 *
 * @param why the backend's reason
 * @returns the message key
 */
export function endedKey(why: string): string {
  return `setup.bridge.ended.${ENDINGS.has(why) ? why : 'other'}`
}

/**
 * Whether a bridge holds a port of the vehicle now: it runs, or it is giving the port back.
 *
 * @param state the bridge, or null before the backend said
 * @returns true while the port is not the vehicle's own
 */
export function holdsPort(state: SerialBridgeState | null): boolean {
  return state !== null && state.state !== 'off'
}

/**
 * Where programs connect to a bridge.
 *
 * @param state the bridge
 * @returns `127.0.0.1:5770`
 */
export function addressOf(state: SerialBridgeState): string {
  return `${state.address ?? ''}:${state.port ?? ''}`
}

/**
 * Why the last bridge ended, while none runs.
 *
 * @param state the bridge
 * @returns the backend's reason, or undefined while one runs or none ever ran
 */
export function endedWhy(state: SerialBridgeState): string | undefined {
  return state.state === 'off' ? state.why : undefined
}
