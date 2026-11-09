/** Where a live vehicle is, as the dashboard's connection form asks for it. */
export interface Endpoint {
  /** How to reach it. */
  transport: 'tcp' | 'udp'
  /** The host name or address. */
  host: string
  /** The port, from 1 to 65535. */
  port: number
}

const ENDPOINT = /^(?<transport>tcp|udp):(?<host>[^:]+):(?<port>\d+)$/u

/**
 * Whether a number is a TCP or UDP port.
 *
 * @param value the number
 * @returns true from 1 to 65535
 */
function isPort(value: number): boolean {
  return value >= 1 && value <= 65_535
}

/**
 * Reads an endpoint written as `tcp:127.0.0.1:5760` or `udp:127.0.0.1:14550`.
 *
 * @param text the endpoint
 * @returns its parts
 * @throws {Error} if it isn't in that form
 */
export function parseEndpoint(text: string): Endpoint {
  const groups = ENDPOINT.exec(text)?.groups
  if (!groups || !isPort(Number(groups.port))) {
    throw new Error(`not an endpoint: ${JSON.stringify(text)} (expected tcp:HOST:PORT or udp:HOST:PORT)`)
  }
  const { transport, host, port } = groups as Record<'transport' | 'host' | 'port', string>

  return { transport: transport as Endpoint['transport'], host, port: Number(port) }
}
