// A TCP proxy that can be cut and restored, between the app and a simulator: a cable pulled and plugged in again.
import { type Server, type Socket, createServer, connect } from 'node:net'
import type { Endpoint } from './endpoint'

/** Where a proxy forwards to. */
export type Target = Pick<Endpoint, 'host' | 'port'>

/** The messages that carry a parameter list: PARAM_VALUE and FILE_TRANSFER_PROTOCOL. */
const DOWNLOAD_MESSAGES = new Set([22, 110])

/**
 * The length of the frame that starts at a place: header, payload, checksum and signature.
 *
 * @param buffer the bytes (the header is whole)
 * @param start where the frame starts
 * @returns its length in bytes
 */
function frameLength(buffer: Buffer, start: number): number {
  const v2 = buffer[start] === 0xFD
  const signed = v2 && (buffer[start + 2]! & 1) === 1

  return (v2 ? 10 : 6) + buffer[start + 1]! + 2 + (signed ? 13 : 0)
}

/**
 * The message id of the frame that starts at a place.
 *
 * @param buffer the bytes (the header is whole)
 * @param start where the frame starts
 * @returns the id
 */
function messageId(buffer: Buffer, start: number): number {
  return buffer[start] === 0xFD ? buffer.readUIntLE(start + 7, 3) : buffer[start + 5]!
}

/**
 * The first whole MAVLink frame in a buffer: where it starts, how long it is and its message id; null when none is whole yet.
 * v2 frames start with 0xFD (10-byte header, 2-byte checksum, a 13-byte signature when the first incompatibility flag is
 * set), v1 frames with 0xFE (6-byte header, 2-byte checksum).
 *
 * @param buffer the bytes
 * @returns the frame, or null
 */
function nextFrame(buffer: Buffer): { start: number, length: number, msgid: number } | null {
  const start = buffer.findIndex(byte => byte === 0xFD || byte === 0xFE)
  const length = start < 0 || buffer.length < start + 10 ? Number.POSITIVE_INFINITY : frameLength(buffer, start)

  return buffer.length < start + length ? null : { start, length, msgid: messageId(buffer, start) }
}

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
  /** Whether only the bytes of the parameter download count towards the cut (`cutInDownload`). */
  #downloadOnly = false
  /** What came from the vehicle and is not a whole frame yet (for `cutInDownload`). */
  #pending: Buffer = Buffer.alloc(0)
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
    this.#downloadOnly = false

    return new Promise(resolve => {
      this.#cutDone.push(resolve)
    })
  }

  /**
   * Pulls the cable in the middle of a parameter download: after this many bytes of it went to the app, counting only the
   * frames that carry the list (PARAM_VALUE, 22, and MAVLink FTP, 110, which ArduPilot sends the packed list over). Counting
   * every byte (`cutAfter`) depends on how much telemetry comes meanwhile, and a list sent over FTP is small: it could be
   * whole before the cut.
   *
   * @param bytes how many bytes of the download before the cut
   * @returns when the cable has been pulled
   */
  cutInDownload(bytes: number): Promise<void> {
    const done = this.cutAfter(bytes)
    this.#downloadOnly = true
    this.#pending = Buffer.alloc(0)

    return done
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
      this.#counted(this.#downloadOnly ? this.#downloadBytes(data) : data.length)
    }
  }

  /**
   * How many bytes of whole frames of the parameter download a chunk of the vehicle's stream completes (a frame split over
   * chunks counts when its end comes).
   *
   * @param data the chunk
   * @returns the bytes of PARAM_VALUE and FTP frames in it
   */
  #downloadBytes(data: Buffer): number {
    this.#pending = Buffer.concat([this.#pending, data])
    let counted = 0
    let frame = nextFrame(this.#pending)
    while (frame !== null) {
      counted += DOWNLOAD_MESSAGES.has(frame.msgid) ? frame.length : 0
      this.#pending = this.#pending.subarray(frame.start + frame.length)
      frame = nextFrame(this.#pending)
    }

    return counted
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
