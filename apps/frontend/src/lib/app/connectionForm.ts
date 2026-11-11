// What the connection bar sends, from plain values (no DOM).
import type { ConnectRequest, SerialPort } from '@/generated/app'

/** What the user typed or chose in the connection form. */
export interface ConnectionForm {
  /** The kind of link. */
  transport: ConnectRequest['transport']
  /** The host of a UDP or TCP link (empty: the default). */
  host: string
  /** The port of a UDP or TCP link, as typed (empty: the default). */
  port: string
  /** The serial device (empty: none listed). */
  device: string
  /** The baud rate of a serial link, as chosen. */
  baud: string
}

/**
 * The request for a serial link.
 *
 * @param form what the user chose
 * @returns the request
 */
function serialRequest(form: ConnectionForm): ConnectRequest {
  return { transport: 'serial', ...(form.device ? { device: form.device } : {}), baud: Number(form.baud) }
}

/**
 * The request for a UDP, TCP or simulator link.
 *
 * @param form what the user typed
 * @returns the request
 */
function networkRequest(form: ConnectionForm): ConnectRequest {
  const host = form.host.trim()
  const port = Number(form.port.trim())

  return { transport: form.transport, ...(host ? { host } : {}), ...(port > 0 ? { port } : {}) }
}

/**
 * What to ask the backend to connect to.
 *
 * @param form what the user typed or chose
 * @returns the request
 */
export function requestFor(form: ConnectionForm): ConnectRequest {
  return form.transport === 'serial' ? serialRequest(form) : networkRequest(form)
}

/** The kinds of link, in the order of the dialog's tabs. */
export const TRANSPORTS = ['udp', 'tcp', 'serial', 'simulator'] as const

/** The key under which the last connection is kept in the settings. */
export const LAST_KEY = 'connect.last'

/**
 * Whether a value read back is a connection form: a known kind of link and the four texts.
 *
 * @param value what was read
 * @returns true when it is
 */
function isForm(value: unknown): value is ConnectionForm {
  const form = value as Record<string, unknown> | null
  const known = TRANSPORTS.some(transport => transport === form?.transport)

  return known && ['host', 'port', 'device', 'baud'].every(key => typeof form?.[key] === 'string')
}

/**
 * The last connection as it is read back from the settings: anything that is not what was written (a file edited by hand,
 * an older version) is not used, and the form keeps its defaults.
 *
 * @param text what the settings hold under `connect.last`, if anything
 * @returns the form, or null
 */
export function parseLast(text: string | undefined): ConnectionForm | null {
  try {
    const value: unknown = JSON.parse(text ?? 'null')

    return isForm(value) ? value : null
  } catch {
    return null
  }
}

/**
 * The device to keep selected when the list of ports changes: the chosen one if it is still there, else the first.
 *
 * @param chosen the device chosen so far
 * @param ports the ports now listed
 * @returns the device, or an empty string without ports
 */
export function deviceAmong(chosen: string, ports: SerialPort[]): string {
  return ports.some(port => port.path === chosen) ? chosen : (ports[0]?.path ?? '')
}
