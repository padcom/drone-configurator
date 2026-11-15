// A vehicle that says what a test tells it to, over a real TCP port: a heartbeat (armed or not, of a system id), a position that
// the test moves (GLOBAL_POSITION_INT, which can go silent) and a home (HOME_POSITION). The simulated vehicles of the suite send
// no position; this one is for what the map draws of one. The link can be cut (the connection is closed, as a cable pulled),
// and the app, which reconnects to the same address, finds the same vehicle, or one with another system id.
import { type Server, type Socket, createServer } from 'node:net'
import { type Heartbeat, MAV_AUTOPILOT_ARDUPILOTMEGA, MSG_GLOBAL_POSITION_INT, MSG_HEARTBEAT, encodeFrame } from './mavlink-wire'

/** HOME_POSITION: its number and its CRC_EXTRA (the common dialect's). */
const MSG_HOME_POSITION = 242

/** Where the vehicle is, as it says it. */
export interface Place {
  /** Degrees. */
  lat: number
  /** Degrees. */
  lon: number
}

/** What the vehicle says of its position. */
export interface Position extends Place {
  /** Degrees clockwise from north. */
  heading: number
  /** Metres above home. */
  height: number
}

/** MAV_MODE_FLAG_SAFETY_ARMED, and the custom mode flag ArduPilot sets. */
const ARMED = 128
const CUSTOM = 1

export type { Heartbeat }

/** A vehicle the test scripts. */
export class ScriptedVehicle {
  /** The port it listens on. */
  port = 0
  #sysid = 1
  #armed = false
  #position: Position | null = null
  #home: Place | null = null
  #silent = false
  #sequence = 0
  readonly #server: Server
  readonly #sockets = new Set<Socket>()
  readonly #timers: ReturnType<typeof setInterval>[] = []

  private constructor() {
    this.#server = createServer(socket => this.#accept(socket))
  }

  /**
   * Starts it: it listens, and sends from the moment someone connects.
   *
   * @returns the vehicle, with its port known
   */
  static async start(): Promise<ScriptedVehicle> {
    const vehicle = new ScriptedVehicle()
    await new Promise<void>(resolve => {
      vehicle.#server.listen(0, '127.0.0.1', resolve)
    })
    const address = vehicle.#server.address()
    vehicle.port = typeof address === 'object' && address !== null ? address.port : 0
    vehicle.#timers.push(
      setInterval(() => vehicle.#send(vehicle.#heartbeat()), 500),
      setInterval(() => vehicle.#sendPosition(), 200),
      setInterval(() => vehicle.#sendHome(), 1000),
    )

    return vehicle
  }

  /**
   * Sets where the vehicle says it is (null: it says nothing of a position).
   *
   * @param position the position
   */
  position(position: Position | null): void {
    this.#position = position
  }

  /**
   * Sets where the vehicle says home is (null: it says nothing).
   *
   * @param home the place
   */
  home(home: Place | null): void {
    this.#home = home
  }

  /**
   * Arms or disarms it (its next heartbeat says so).
   *
   * @param armed whether it is armed
   */
  arm(armed: boolean): void {
    this.#armed = armed
  }

  /**
   * Gives it another system id (the next link it makes is of another vehicle).
   *
   * @param sysid the system id
   */
  setSysid(sysid: number): void {
    this.#sysid = sysid
  }

  /**
   * Makes it stop sending its position (the heartbeat goes on: the link is up and the position is old), or send it again.
   *
   * @param silent whether it is silent
   */
  silence(silent: boolean): void {
    this.#silent = silent
  }

  /** Cuts the link: every connection is closed (the app finds the vehicle again at the same address). */
  cut(): void {
    this.#sockets.forEach(socket => socket.destroy())
    this.#sockets.clear()
  }

  /** Stops it. */
  stop(): void {
    this.#timers.forEach(timer => clearInterval(timer))
    this.cut()
    this.#server.close()
  }

  /**
   * Takes a connection: what the app says to it is not looked at.
   *
   * @param socket the connection
   */
  #accept(socket: Socket): void {
    this.#sockets.add(socket)
    socket.on('data', () => undefined)
    socket.on('error', () => undefined)
    socket.on('close', () => this.#sockets.delete(socket))
    this.#send(this.#heartbeat())
  }

  /**
   * Sends a frame to every connection.
   *
   * @param frame the bytes
   */
  #send(frame: Uint8Array): void {
    this.#sockets.forEach(socket => socket.write(frame))
  }

  /**
   * The heartbeat of the vehicle as it is now.
   *
   * @returns the frame
   */
  #heartbeat(): Uint8Array {
    const payload = new Uint8Array(9)
    // type 2 (quadrotor), autopilot 3 (ArduPilot), base mode, status 4 (active), MAVLink version 3
    payload.set([2, MAV_AUTOPILOT_ARDUPILOTMEGA, (this.#armed ? ARMED : 0) | CUSTOM, 4, 3], 4)

    return this.#frame(MSG_HEARTBEAT, payload)
  }

  /** Sends the position, unless it is not given or the vehicle is silent. */
  #sendPosition(): void {
    if (this.#position && !this.#silent) {
      const payload = new Uint8Array(28)
      const view = new DataView(payload.buffer)
      view.setUint32(0, Math.round(performance.now()), true)
      view.setInt32(4, Math.round(this.#position.lat * 1e7), true)
      view.setInt32(8, Math.round(this.#position.lon * 1e7), true)
      view.setInt32(12, 488_000 + Math.round(this.#position.height * 1000), true)
      view.setInt32(16, Math.round(this.#position.height * 1000), true)
      view.setUint16(26, Math.round(this.#position.heading * 100), true)
      this.#send(this.#frame(MSG_GLOBAL_POSITION_INT, payload))
    }
  }

  /** Sends home, when the vehicle has one. */
  #sendHome(): void {
    if (this.#home) {
      const payload = new Uint8Array(60)
      const view = new DataView(payload.buffer)
      view.setInt32(0, Math.round(this.#home.lat * 1e7), true)
      view.setInt32(4, Math.round(this.#home.lon * 1e7), true)
      view.setInt32(8, 488_000, true)
      this.#send(this.#frame(MSG_HOME_POSITION, payload))
    }
  }

  /**
   * One message as the vehicle sends it.
   *
   * @param id the message
   * @param payload its payload
   * @returns the frame
   */
  #frame(id: number, payload: Uint8Array): Uint8Array {
    this.#sequence = (this.#sequence + 1) % 256

    return encodeFrame(id, payload, { systemId: this.#sysid, componentId: 1 }, this.#sequence)
  }
}
