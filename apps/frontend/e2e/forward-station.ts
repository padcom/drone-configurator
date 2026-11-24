// A second ground station for the E2E tests of the forwarding (#34): a UDP socket the app forwards the vehicle's MAVLink to,
// which reads parameters through the forward (its requests go back through the app to the vehicle). Written from the MAVLink
// specification (PARAM_REQUEST_READ, PARAM_REQUEST_LIST, PARAM_VALUE), with mavlink-wire.ts for the framing.
import { type Socket, createSocket } from 'node:dgram'
import { type AddressInfo } from 'node:net'
import {
  type Frame, FrameReader, MSG_PARAM_REQUEST_LIST, MSG_PARAM_REQUEST_READ, MSG_PARAM_VALUE, asHeartbeat, encodeFrame,
} from './mavlink-wire'

/** Who the station is: not the app's system (255), so the vehicle and the app tell them apart. */
const STATION = { systemId: 250, componentId: 190 }

/** One PARAM_VALUE. */
export interface StationParam {
  /** Its name. */
  name: string
  /** Its value, as the float on the wire. */
  value: number
  /** Its place in the list. */
  index: number
  /** How many parameters the vehicle has. */
  count: number
}

/**
 * Waits.
 *
 * @param ms how long
 * @returns when it has
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

/**
 * A PARAM_VALUE's fields (MAVLink 2 trims the zeros at the end of a payload: they are put back).
 *
 * @param frame a frame
 * @returns the parameter, if the frame is a PARAM_VALUE
 */
function paramOf(frame: Frame): StationParam | undefined {
  if (frame.messageId !== MSG_PARAM_VALUE) {
    return undefined
  }
  const payload = new Uint8Array(25)
  payload.set(frame.payload.subarray(0, 25))
  const view = new DataView(payload.buffer)
  const name = new TextDecoder().decode(payload.subarray(8, 24)).replace(/\0.*$/su, '')

  return { name, value: view.getFloat32(0, true), count: view.getUint16(4, true), index: view.getUint16(6, true) }
}

/** The station: what has arrived, and the requests it sends back through the forward. */
export class ForwardStation {
  /** Every frame that has arrived, in order. */
  readonly frames: Frame[] = []
  /** The parameters heard, by name. */
  readonly params = new Map<string, StationParam>()
  readonly #socket: Socket
  readonly #reader = new FrameReader()
  /** Where the app sends from: requests go back there. */
  #app: AddressInfo | null = null
  #sequence = 0

  private constructor(socket: Socket) {
    this.#socket = socket
    socket.on('message', (bytes, from) => this.#arrived(bytes, from))
  }

  /**
   * Opens a station on a free UDP port of this computer.
   *
   * @returns the station
   */
  static async open(): Promise<ForwardStation> {
    const socket = createSocket('udp4')
    await new Promise<void>(resolve => {
      socket.bind(0, '127.0.0.1', resolve)
    })

    return new ForwardStation(socket)
  }

  /**
   * The port it listens on.
   *
   * @returns the port
   */
  get port(): number {
    return this.#socket.address().port
  }

  /** Forgets what has arrived. */
  clear(): void {
    this.frames.length = 0
    this.params.clear()
  }

  /** Stops listening. */
  close(): void {
    this.#socket.close()
  }

  /**
   * Waits for a heartbeat of the vehicle `systemId` through the forward.
   *
   * @param systemId the vehicle's system
   * @param timeoutMs how long it may take
   */
  async waitForHeartbeat(systemId: number, timeoutMs: number): Promise<void> {
    const heard = () => this.frames.some(f => f.systemId === systemId && asHeartbeat(f) !== undefined)
    await this.#until(heard, timeoutMs, 'a heartbeat')
  }

  /**
   * Reads one parameter through the forward: PARAM_REQUEST_READ, asked again each second until its PARAM_VALUE comes.
   *
   * @param target the vehicle
   * @param target.systemId its system
   * @param target.componentId its component
   * @param name the parameter
   * @param timeoutMs how long it may take
   * @returns its value
   */
  async readParam(target: { systemId: number, componentId: number }, name: string, timeoutMs: number): Promise<number> {
    // (a PARAM_REQUEST_READ: param_index -1 asks by name)
    this.params.delete(name)
    const payload = new Uint8Array(20)
    new DataView(payload.buffer).setInt16(0, -1, true)
    payload[2] = target.systemId
    payload[3] = target.componentId
    payload.set(new TextEncoder().encode(name), 4)
    await this.#asking(() => this.#send(MSG_PARAM_REQUEST_READ, payload), () => this.params.has(name), timeoutMs, name)

    return this.params.get(name)?.value ?? Number.NaN
  }

  /**
   * Reads the whole list through the forward: PARAM_REQUEST_LIST, then each one missing by its index, until all have come.
   *
   * @param target the vehicle
   * @param target.systemId its system
   * @param target.componentId its component
   * @param timeoutMs how long it may take
   * @returns how many the vehicle says it has (all of them have arrived)
   */
  async readList(target: { systemId: number, componentId: number }, timeoutMs: number): Promise<number> {
    this.params.clear()
    await this.#send(MSG_PARAM_REQUEST_LIST, Uint8Array.of(target.systemId, target.componentId))
    const complete = () => this.#count() > 0 && this.#indexes().size >= this.#count()
    await this.#asking(() => this.#askMissing(target), complete, timeoutMs, 'the whole list')

    return this.#count()
  }

  /**
   * How many parameters the vehicle says it has.
   *
   * @returns the count, 0 before one has come
   */
  #count(): number {
    return [...this.params.values()][0]?.count ?? 0
  }

  /**
   * The indexes that have come.
   *
   * @returns them
   */
  #indexes(): Set<number> {
    return new Set([...this.params.values()].map(p => p.index))
  }

  /**
   * Asks for the parameters that have not come, by index (a few at a time: the list goes on arriving meanwhile).
   *
   * @param target the vehicle
   * @param target.systemId its system
   * @param target.componentId its component
   */
  async #askMissing(target: { systemId: number, componentId: number }): Promise<void> {
    if (this.#count() === 0) {
      await this.#send(MSG_PARAM_REQUEST_LIST, Uint8Array.of(target.systemId, target.componentId))

      return
    }
    const have = this.#indexes()
    const missing = Array.from({ length: this.#count() }, (_, i) => i).filter(i => !have.has(i)).slice(0, 20)
    await Promise.all(missing.map(index => {
      const payload = new Uint8Array(20)
      new DataView(payload.buffer).setInt16(0, index, true)
      payload[2] = target.systemId
      payload[3] = target.componentId

      return this.#send(MSG_PARAM_REQUEST_READ, payload)
    }))
  }

  /**
   * Sends a frame to the app (once it has sent something: before that, where it is is not known).
   *
   * @param messageId the message
   * @param payload its payload
   */
  async #send(messageId: number, payload: Uint8Array): Promise<void> {
    const app = this.#app
    if (app === null) {
      return
    }
    const frame = encodeFrame(messageId, payload, STATION, this.#sequence++ & 0xff)
    await new Promise<void>((resolve, reject) => {
      this.#socket.send(frame, app.port, app.address, error => (error ? reject(error) : resolve()))
    })
  }

  /**
   * Asks, and asks again each second, until `done` or the time is up.
   *
   * @param ask what to send
   * @param done whether the answer has come
   * @param timeoutMs how long it may take
   * @param what what is waited for, for the failure
   * @throws {Error} when the time is up
   */
  async #asking(ask: () => Promise<void>, done: () => boolean, timeoutMs: number, what: string): Promise<void> {
    const until = Date.now() + timeoutMs
    while (!done()) {
      if (Date.now() > until) {
        throw new Error(`the station got no answer for ${what} through the forward in ${timeoutMs} ms`)
      }
      // eslint-disable-next-line no-await-in-loop
      await ask()
      // eslint-disable-next-line no-await-in-loop
      await this.#until(done, 1000, what).catch(() => undefined)
    }
  }

  /**
   * Waits for a condition.
   *
   * @param done the condition
   * @param timeoutMs how long it may take
   * @param what what is waited for, for the failure
   * @throws {Error} when the time is up
   */
  async #until(done: () => boolean, timeoutMs: number, what: string): Promise<void> {
    const until = Date.now() + timeoutMs
    while (!done()) {
      if (Date.now() > until) {
        throw new Error(`no ${what} arrived at the station in ${timeoutMs} ms`)
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(20)
    }
  }

  /**
   * Takes a datagram from the app.
   *
   * @param bytes what came
   * @param from who sent it
   */
  #arrived(bytes: Buffer, from: AddressInfo): void {
    this.#app = from

    for (const frame of this.#reader.push(new Uint8Array(bytes))) {
      this.frames.push(frame)
      const param = paramOf(frame)

      if (param) {
        this.params.set(param.name, param)
      }
    }
  }
}
