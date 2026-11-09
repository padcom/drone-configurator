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
  #muted = false
  /** After how many of the vehicle's bytes the cable is pulled (counted from `cutAfter`), if it is to be. */
  #cutAt: number | undefined
  #sent = 0
  readonly #cutDone: (() => void)[] = []
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
   * Pulls the cable after `bytes` more bytes have gone from the vehicle to the app: somewhere in the middle of a download
   * that is about to start, whatever the speed of the machine.
   *
   * @param bytes how many bytes of the vehicle's to let through
   * @returns a promise that resolves when the cable has been pulled
   */
  cutAfter(bytes: number): Promise<void> {
    this.#sent = 0
    this.#cutAt = bytes

    return new Promise(resolve => {
      this.#cutDone.push(resolve)
    })
  }

  /** Keeps the connections, but passes nothing in either direction: a vehicle that went quiet on a link that is still up. */
  mute() {
    this.#muted = true
  }

  /** Passes bytes again. */
  unmute() {
    this.#muted = false
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
    client.on('data', (data: Buffer) => this.#carry(data, upstream, false))
    upstream.on('data', (data: Buffer) => this.#carry(data, client, true))
  }

  /**
   * Passes bytes on, unless the cable is muted; and cuts the cable once the bytes asked for by `cutAfter` have gone to
   * the app.
   *
   * @param data the bytes
   * @param to where they go
   * @param towardsApp whether they are the vehicle's
   */
  #carry(data: Buffer, to: Socket, towardsApp: boolean) {
    if (this.#muted) {
      return
    }
    to.write(data)

    if (towardsApp) {
      this.#counted(data.length)
    }
  }

  /**
   * Counts the vehicle's bytes that went to the app towards the cut asked for by `cutAfter`, and pulls the cable when
   * they are enough.
   *
   * @param bytes how many have just gone
   */
  #counted(bytes: number) {
    this.#sent += bytes

    if (this.#cutAt !== undefined && this.#sent >= this.#cutAt) {
      this.#cutAt = undefined
      this.cut()
      this.#cutDone.splice(0).forEach(resolve => resolve())
    }
  }
}
