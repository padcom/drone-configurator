// The serial ports page's tables. The protocol and baud lists are ArduPilot's own
// (libraries/AP_SerialManager/AP_SerialManager.cpp lines 188 and 169: SERIALn_PROTOCOL and SERIALn_BAUD): the names are the
// vehicle's own vocabulary (MAVLink2, Rangefinder, ...), and a value not in a list is shown as its number. A baud is the code
// the parameter holds: 57 is 57600, 1500 is 1.5 million.

import type { Named } from './frame'

/** SERIALn_PROTOCOL (the name of -1, "None", is a message of the interface). */
export const PROTOCOLS: readonly Named[] = [
  { value: 1, name: 'MAVLink1' },
  { value: 2, name: 'MAVLink2' },
  { value: 3, name: 'Frsky D' },
  { value: 4, name: 'Frsky SPort' },
  { value: 5, name: 'GPS' },
  { value: 7, name: 'Alexmos Gimbal Serial' },
  { value: 8, name: 'Gimbal' },
  { value: 9, name: 'Rangefinder' },
  { value: 10, name: 'FrSky SPort Passthrough (OpenTX)' },
  { value: 11, name: 'Lidar360' },
  { value: 13, name: 'Beacon' },
  { value: 14, name: 'Volz servo out' },
  { value: 15, name: 'SBus servo out' },
  { value: 16, name: 'ESC Telemetry' },
  { value: 17, name: 'Devo Telemetry' },
  { value: 18, name: 'OpticalFlow' },
  { value: 19, name: 'RobotisServo' },
  { value: 20, name: 'NMEA Output' },
  { value: 21, name: 'WindVane' },
  { value: 22, name: 'SLCAN' },
  { value: 23, name: 'RCIN' },
  { value: 24, name: 'EFI Serial' },
  { value: 25, name: 'LTM' },
  { value: 26, name: 'RunCam' },
  { value: 27, name: 'HottTelem' },
  { value: 28, name: 'Scripting' },
  { value: 29, name: 'Crossfire VTX' },
  { value: 30, name: 'Generator' },
  { value: 31, name: 'Winch' },
  { value: 32, name: 'MSP' },
  { value: 33, name: 'DJI FPV' },
  { value: 34, name: 'AirSpeed' },
  { value: 35, name: 'ADSB' },
  { value: 36, name: 'AHRS' },
  { value: 37, name: 'SmartAudio' },
  { value: 38, name: 'FETtecOneWire' },
  { value: 39, name: 'Torqeedo' },
  { value: 40, name: 'AIS' },
  { value: 41, name: 'CoDevESC' },
  { value: 42, name: 'DisplayPort' },
  { value: 43, name: 'MAVLink High Latency' },
  { value: 44, name: 'IRC Tramp' },
  { value: 45, name: 'DDS XRCE' },
  { value: 46, name: 'IMUDATA' },
  { value: 48, name: 'PPP' },
  { value: 49, name: 'i-BUS Telemetry' },
  { value: 50, name: 'IOMCU' },
]

/** SERIALn_BAUD: the code, and the speed it stands for. */
export const BAUDS: readonly Named[] = [
  { value: 1, name: '1200' },
  { value: 2, name: '2400' },
  { value: 4, name: '4800' },
  { value: 9, name: '9600' },
  { value: 19, name: '19200' },
  { value: 38, name: '38400' },
  { value: 57, name: '57600' },
  { value: 111, name: '111100' },
  { value: 115, name: '115200' },
  { value: 230, name: '230400' },
  { value: 256, name: '256000' },
  { value: 460, name: '460800' },
  { value: 500, name: '500000' },
  { value: 921, name: '921600' },
  { value: 1500, name: '1.5 Mbaud' },
  { value: 2000, name: '2 Mbaud' },
  { value: 12500000, name: '12.5 Mbaud' },
]

/** The most ports a board has (SERIAL0 to SERIAL9). */
export const MAX_PORTS = 10

/** The protocols that carry MAVLink: a port set to one may be the way a ground station talks to the vehicle. */
const MAVLINK = [1, 2, 43]

/**
 * The parameters of a port.
 *
 * @param port the port, 0 for SERIAL0
 * @returns its protocol and its baud
 */
export function portParams(port: number): { protocol: string, baud: string } {
  return { protocol: `SERIAL${port}_PROTOCOL`, baud: `SERIAL${port}_BAUD` }
}

/**
 * The ports this vehicle has: those whose protocol and baud are both on it.
 *
 * @param has whether a parameter is on the vehicle
 * @returns their numbers, in order
 */
export function portsOn(has: (id: string) => boolean): number[] {
  const all = Array.from({ length: MAX_PORTS }, (_unused, port) => port)

  return all.filter(port => has(portParams(port).protocol) && has(portParams(port).baud))
}

/**
 * How many ports are in use: the protocol is not -1 (none).
 *
 * @param protocols the protocol of each port
 * @returns the count
 */
export function inUse(protocols: readonly number[]): number {
  return protocols.filter(protocol => protocol !== -1).length
}

/**
 * Whether changing this port may cut the connection the app talks over: a port that carries MAVLink now, or SERIAL0 (the port a
 * ground station usually connects to). The page says "may": it does not know which port the link is on.
 *
 * @param port the port
 * @param protocolNow the protocol it has now
 * @returns true when a change may cut it
 */
export function mayCutLink(port: number, protocolNow: number): boolean {
  return port === 0 || MAVLINK.includes(protocolNow)
}

/**
 * Whether a write changed a port.
 *
 * @param written the parameters written
 * @param port the port
 * @returns true when its protocol or its speed is among them
 */
function wasWritten(written: readonly string[], port: number): boolean {
  const { protocol, baud } = portParams(port)

  return written.includes(protocol) || written.includes(baud)
}

/**
 * The ports a write changed that may cut the link when the vehicle reboots: the ones that carried MAVLink before the write (or
 * are SERIAL0).
 *
 * @param written the parameters written and not rebooted for yet
 * @param was what each had before it was written
 * @param now what the vehicle has now
 * @returns the ports, in order
 */
export function cutByReboot(
  written: readonly string[],
  was: Readonly<Record<string, number>>,
  now: (id: string) => number | null,
): number[] {
  const ports = Array.from({ length: MAX_PORTS }, (_unused, port) => port)
  const before = (port: number) => was[portParams(port).protocol] ?? now(portParams(port).protocol) ?? -1

  return ports.filter(port => wasWritten(written, port) && mayCutLink(port, before(port)))
}

/**
 * Every parameter of some ports.
 *
 * @param ports the ports
 * @returns their protocol and baud parameters, in order
 */
export function idsOf(ports: readonly number[]): string[] {
  return ports.flatMap(port => [portParams(port).protocol, portParams(port).baud])
}
