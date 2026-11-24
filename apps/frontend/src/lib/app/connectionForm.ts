// What the connection bar sends, from plain values (no DOM).
import type { ConnectRequest, SerialPort } from '@/generated/app'

/**
 * What the user typed or chose in the connection form. For a serial link, an empty device or baud rate is left to the backend
 * to find (#27): the port most likely to be the autopilot, and the first common rate that brings MAVLink.
 */
export interface ConnectionForm {
  /** The kind of link. */
  transport: ConnectRequest['transport']
  /** The host of a UDP or TCP link (empty: the default); for a link that listens, `ALL_INTERFACES` or empty. */
  host: string
  /** The port of a UDP or TCP link, as typed (empty: the default). */
  port: string
  /** The serial device (empty: the one the backend finds). */
  device: string
  /** The baud rate of a serial link, as chosen (empty: the one the backend finds). */
  baud: string
}

/**
 * The request for a serial link.
 *
 * @param form what the user chose
 * @returns the request
 */
function serialRequest(form: ConnectionForm): ConnectRequest {
  const baud = Number(form.baud)

  return { transport: 'serial', ...(form.device ? { device: form.device } : {}), ...(baud > 0 ? { baud } : {}) }
}

/** The address that a link which listens is bound to when the user chooses every network interface: it exposes the port. */
export const ALL_INTERFACES = '0.0.0.0'

/** The links on which the backend listens (#197): the vehicle sends to it, or connects to it. */
const LISTENING: readonly ConnectRequest['transport'][] = ['udp', 'tcp-server']

/**
 * Whether the backend listens for the vehicle on this kind of link (it takes no host to go to, only whether every network
 * interface listens).
 *
 * @param transport the kind of link
 * @returns true when it listens
 */
export function listens(transport: ConnectRequest['transport']): boolean {
  return LISTENING.includes(transport)
}

/**
 * The host a request names: for a link that listens, every interface or none (the backend's loopback default); for one that
 * goes to the vehicle, what was typed.
 *
 * @param form what the user typed
 * @returns the host, or an empty string for the default
 */
function hostOf(form: ConnectionForm): string {
  const host = form.host.trim()
  if (listens(form.transport)) {
    return host === ALL_INTERFACES ? host : ''
  }

  return host
}

/**
 * The request for a UDP, TCP or simulator link.
 *
 * @param form what the user typed
 * @returns the request
 */
function networkRequest(form: ConnectionForm): ConnectRequest {
  const host = hostOf(form)
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

/** The dialog's tabs, in order: UDP and TCP each have two ways round (see `ROLES`). */
export const TABS = ['udp', 'tcp', 'serial', 'simulator'] as const

/** A tab of the dialog. */
export type Tab = typeof TABS[number]

/** The two ways round of UDP and TCP: the first is the one a tab starts on. */
export const ROLES: Readonly<Record<'udp' | 'tcp', readonly [ConnectRequest['transport'], ConnectRequest['transport']]>> = {
  udp: ['udp', 'udp-client'],
  tcp: ['tcp', 'tcp-server'],
}

/** Every kind of link. */
export const TRANSPORTS: readonly ConnectRequest['transport'][] = [
  'udp', 'udp-client', 'tcp', 'tcp-server', 'serial', 'simulator',
]

/**
 * The tab a kind of link is under.
 *
 * @param transport the kind of link
 * @returns its tab
 */
export function tabOf(transport: ConnectRequest['transport']): Tab {
  const network = (Object.keys(ROLES) as ('udp' | 'tcp')[]).find(tab => ROLES[tab].includes(transport))

  return network ?? (transport as Tab)
}

/**
 * The kind of link a tab chooses: the one already chosen when it is under that tab, else the tab's first.
 *
 * @param tab the tab
 * @param current the kind of link chosen now
 * @returns the kind of link
 */
export function transportFor(tab: Tab, current: ConnectRequest['transport']): ConnectRequest['transport'] {
  if (tabOf(current) === tab) {
    return current
  }

  return tab === 'udp' || tab === 'tcp' ? ROLES[tab][0] : tab
}

/** The port each kind of network link uses when none is typed (the backend's defaults). */
export const DEFAULT_PORTS: Readonly<Record<string, string>> = {
  'udp': '14550', 'udp-client': '14550', 'tcp': '5760', 'tcp-server': '5760',
}

/** The key under which the last connection is kept in the settings. */
export const LAST_KEY = 'connect.last'

/**
 * The form before any connection was made: UDP on the default port (14550, where SITL and most telemetry bridges send), and
 * for serial, the port and the rate found by the backend.
 */
export const FIRST_FORM: Readonly<ConnectionForm> = { transport: 'udp', host: '', port: '', device: '', baud: '' }

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
 * What reconnects to the last connection, read from the settings.
 *
 * @param text what the settings hold under `connect.last`, if anything
 * @returns the request, or null when no connection was kept
 */
export function lastRequest(text: string | undefined): ConnectRequest | null {
  const last = parseLast(text)

  return last ? requestFor(last) : null
}

/**
 * The device to keep selected when the list of ports changes: the chosen one if it is still there, else the one the backend
 * finds (an empty string).
 *
 * @param chosen the device chosen so far (empty: the one the backend finds)
 * @param ports the ports now listed
 * @returns the device, or an empty string
 */
export function deviceAmong(chosen: string, ports: SerialPort[]): string {
  return ports.some(port => port.path === chosen) ? chosen : ''
}
