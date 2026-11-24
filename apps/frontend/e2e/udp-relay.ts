// A stand-in for a router that listens for ground stations on UDP, as MAVProxy's `--out udpin:<port>` does (#197): SITL sends to
// one port of it (`--serialN udpclient:127.0.0.1:<sitlPort>`), and a ground station that sends to its other port (`port`) gets
// what SITL sends; what the ground station sends goes to SITL. It forwards datagrams as they are and drops what comes before the
// far side is known. It is what the app's "udp-client" connects to in the SITL tests: SITL itself has no UDP port that listens.
import { type Socket, createSocket } from 'node:dgram'

/** Where a datagram came from. */
interface Peer {
  /** Its IPv4 address. */
  address: string
  /** Its port. */
  port: number
}

/**
 * Binds a UDP socket to a port of 127.0.0.1.
 *
 * @param port the port (0: any free one)
 * @returns the socket
 */
async function bound(port: number): Promise<Socket> {
  const socket = createSocket('udp4')
  await new Promise<void>(resolve => {
    socket.bind(port, '127.0.0.1', resolve)
  })

  return socket
}

/** The relay: two UDP ports of 127.0.0.1. */
export class UdpRelay {
  readonly #vehicle: Socket
  readonly #station: Socket
  #vehiclePeer: Peer | undefined
  #stationPeer: Peer | undefined

  private constructor(vehicle: Socket, station: Socket) {
    this.#vehicle = vehicle
    this.#station = station
    vehicle.on('message', (message, from) => {
      this.#vehiclePeer = from
      UdpRelay.#forward(station, message, this.#stationPeer)
    })
    station.on('message', (message, from) => {
      this.#stationPeer = from
      UdpRelay.#forward(vehicle, message, this.#vehiclePeer)
    })
  }

  /**
   * Starts it on two free ports.
   *
   * @returns the running relay
   */
  static async start(): Promise<UdpRelay> {
    return new UdpRelay(await bound(0), await bound(0))
  }

  /**
   * The port SITL sends to.
   *
   * @returns the port
   */
  get sitlPort(): number {
    return this.#vehicle.address().port
  }

  /**
   * The port a ground station sends to.
   *
   * @returns the port
   */
  get port(): number {
    return this.#station.address().port
  }

  /** Stops it. */
  close(): void {
    this.#vehicle.close()
    this.#station.close()
  }

  /**
   * Sends a datagram on, when the far side is known.
   *
   * @param socket the socket to send from
   * @param message the datagram
   * @param to the far side, if it is known
   */
  static #forward(socket: Socket, message: Buffer, to: Peer | undefined): void {
    if (to) {
      socket.send(message, to.port, to.address)
    }
  }
}
