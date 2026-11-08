/** Where a live vehicle is, as the dashboard's connection form asks for it. */
export interface Endpoint {
  transport: 'tcp' | 'udp'
  host: string
  port: number
}

/**
 * Reads an endpoint written as `tcp:127.0.0.1:5760` or `udp:127.0.0.1:14550`.
 *
 * @param text the endpoint
 * @returns its parts
 * @throws Error if it isn't in that form
 */
export function parseEndpoint(text: string): Endpoint {
  const { transport, host, port } = /^(?<transport>tcp|udp):(?<host>[^:]+):(?<port>\d+)$/u.exec(text)?.groups ?? {}
  const portNumber = Number(port)
  if (!transport || !host || !(portNumber >= 1 && portNumber <= 65_535)) {
    throw new Error(`not an endpoint: ${JSON.stringify(text)} (expected tcp:HOST:PORT or udp:HOST:PORT)`)
  }

  return { transport: transport as Endpoint['transport'], host, port: portNumber }
}
