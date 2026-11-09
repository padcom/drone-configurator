// A TCP proxy that can be cut and restored, between the app and a simulator: a cable pulled and plugged in again.
import { type Server, type Socket, createServer, connect } from 'node:net'
import type { Endpoint } from './endpoint'

/** Where a proxy forwards to. */
export type Target = Pick<Endpoint, 'host' | 'port'>

/** A TCP proxy on a free local port. */
export class FlakyProxy {
  /** The port to connect to. */
  port = 0
  /** How many connections it accepted and forwarded (those refused while cut are not counted). */
  forwarded = 0
  #target: Target
  #cut = false
  readonly #server: Server
  readonly #sockets = new Set<Socket>()

  private constructor(target: Target) {
    this.#target = target
    this.#server = createServer(client => this.#accept(client))
  }

  /**
   * Starts a proxy.
   *
   * @param target where it forwards to
   * @returns the running proxy, with its port known
   */
  static async start(target: Target): Promise<FlakyProxy> {
    const proxy = new FlakyProxy(target)
    await new Promise<void>((resolve, reject) => {
      proxy.#server.once('error', reject)
      proxy.#server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = proxy.#server.address()
    proxy.port = typeof address === 'object' && address ? address.port : 0

    return proxy
  }

  /**
   * Whether the cable is pulled.
   *
   * @returns true between `cut()` and `restore()`
   */
  get isCut(): boolean {
    return this.#cut
  }

  /** Pulls the cable: every connection ends now, and new ones are closed as soon as they are made. */
  cut() {
    this.#cut = true

    for (const socket of this.#sockets) {
      socket.destroy()
    }

    this.#sockets.clear()
  }

  /** Plugs the cable in again: new connections are forwarded. */
  restore() {
    this.#cut = false
  }

  /**
   * Forwards new connections somewhere else (another vehicle behind the same address). The ones made already stay.
   *
   * @param target the new place
   */
  retarget(target: Target) {
    this.#target = target
  }

  /** Ends every connection and stops listening. */
  async stop(): Promise<void> {
    this.cut()
    await new Promise<void>(resolve => {
      this.#server.close(() => resolve())
    })
  }

  /**
   * Forwards a client's connection, or ends it if the cable is pulled.
   *
   * @param client the connection that came in
   */
  #accept(client: Socket) {
    if (this.#cut) {
      client.destroy()

      return
    }
    this.forwarded += 1
    const upstream = connect(this.#target.port, this.#target.host)
    for (const socket of [client, upstream]) {
      this.#sockets.add(socket)
      socket.on('error', () => socket.destroy())
      socket.on('close', () => {
        this.#sockets.delete(socket)
        client.destroy()
        upstream.destroy()
      })
    }
    client.pipe(upstream)
    upstream.pipe(client)
  }
}
