// What the connection bar sends and says, from plain values (no DOM). Vue's templates escape the text.
import type { ConnectRequest, SerialPort, VehicleInfo } from './generated/app'

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

/**
 * The vehicle the link found, for the status line.
 *
 * @param vehicle what the backend reported, if anything
 * @returns " · system 1/1 · QUADROTOR · ARDUPILOTMEGA", or an empty string
 */
export function vehicleText(vehicle: VehicleInfo | undefined): string {
  return vehicle ? ` · system ${vehicle.sysid}/${vehicle.compid} · ${vehicle.type} · ${vehicle.autopilot}` : ''
}

/**
 * How a serial port is listed.
 *
 * @param port the port
 * @returns its path, and its description in brackets if it has one
 */
export function portLabel(port: SerialPort): string {
  return port.description ? `${port.path} (${port.description})` : port.path
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
