// A vehicle that says what a test tells it to, over a real TCP port: a heartbeat (armed or not, of a system id), a position that
// the test moves (GLOBAL_POSITION_INT, which can go silent) and a home (HOME_POSITION). The simulated vehicles of the suite send
// no position; this one is for what the map draws of one. The link can be cut (the connection is closed, as a cable pulled),
// and the app, which reconnects to the same address, finds the same vehicle, or one with another system id. It can also be made
// ready to take off (a 3D fix and an EKF with its position), gives the parameters it was given, and answers the commands of a
// flight: a change of mode and an arm take effect in its next heartbeat, a takeoff is taken note of, each is accepted.
import { type Server, type Socket, createServer } from 'node:net'
import {
  type Frame, FrameReader, type Heartbeat, MAV_AUTOPILOT_ARDUPILOTMEGA, MSG_COMMAND_ACK, MSG_COMMAND_LONG, MSG_EKF_STATUS_REPORT,
  MSG_GLOBAL_POSITION_INT, MSG_GPS_RAW_INT, MSG_HEARTBEAT, MSG_PARAM_REQUEST_LIST, MSG_PARAM_VALUE, encodeFrame,
} from './mavlink-wire'

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

/** MAV_CMD numbers of the commands it answers. */
const CMD_NAV_TAKEOFF = 22
const CMD_DO_SET_MODE = 176
const CMD_ARM_DISARM = 400

/** What a command it was sent said. */
export interface Received {
  /** The MAV_CMD. */
  command: number
  /** Its seven parameters. */
  params: number[]
}

/** The EKF flags of a vehicle that has its position (attitude, velocity, position), and a 3D fix. */
const EKF_READY = 1 | 2 | 4 | 16 | 32
const FIX_3D = 3

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
  #mode = 0
  #ready = false
  #params = new Map<string, number>()
  readonly #received: Received[] = []
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
      setInterval(() => vehicle.#sendReadiness(), 200),
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
   * Makes it ready to take off (a 3D GPS fix and an EKF with its position), or not (no fix, no position of the EKF).
   *
   * @param ready whether it is
   */
  ready(ready: boolean): void {
    this.#ready = ready
  }

  /**
   * Gives it the parameters it sends when they are asked for.
   *
   * @param params their values, by name
   */
  params(params: Record<string, number>): void {
    this.#params = new Map(Object.entries(params))
  }

  /**
   * The commands it was sent, in order (a takeoff among them).
   *
   * @returns what they said
   */
  received(): readonly Received[] {
    return this.#received
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
    const reader = new FrameReader()
    socket.on('data', (chunk: Buffer) => reader.push(chunk).forEach(frame => this.#hear(frame, socket)))
    socket.on('error', () => undefined)
    socket.on('close', () => this.#sockets.delete(socket))
    this.#send(this.#heartbeat())
  }

  /**
   * What a frame from the app asks: the commands of a flight are accepted, and the parameters are sent when they are asked for.
   *
   * @param frame the message
   * @param socket where it came from
   */
  #hear(frame: Frame, socket: Socket): void {
    if (frame.messageId === MSG_PARAM_REQUEST_LIST) {
      this.#sendParams(socket)
    } else if (frame.messageId === MSG_COMMAND_LONG) {
      this.#obey(frame, socket)
    }
  }

  /**
   * Does a command and says that it was accepted.
   *
   * @param frame the COMMAND_LONG
   * @param socket where it came from
   */
  #obey(frame: Frame, socket: Socket): void {
    const payload = new Uint8Array(33)
    payload.set(frame.payload)
    const view = new DataView(payload.buffer)
    const params = Array.from({ length: 7 }, (_, index) => view.getFloat32(index * 4, true))
    const command = view.getUint16(28, true)
    this.#received.push({ command, params })

    if (!this.#take(command, params)) {
      return
    }
    const ack = new Uint8Array(10)
    new DataView(ack.buffer).setUint16(0, command, true)
    socket.write(this.#frame(MSG_COMMAND_ACK, ack))
  }

  /**
   * Takes a command into its state (a mode, an arm) or notes it (a takeoff).
   *
   * @param command the MAV_CMD
   * @param params its parameters
   * @returns whether it is one the vehicle answers
   */
  #take(command: number, params: number[]): boolean {
    if (command === CMD_DO_SET_MODE) {
      this.#mode = Math.round(params[1] ?? 0)
    } else if (command === CMD_ARM_DISARM) {
      this.#armed = params[0] === 1
    }

    return [CMD_DO_SET_MODE, CMD_ARM_DISARM, CMD_NAV_TAKEOFF].includes(command)
  }

  /**
   * Sends all its parameters.
   *
   * @param socket who asked
   */
  #sendParams(socket: Socket): void {
    const entries = [...this.#params.entries()]
    entries.forEach(([name, value], index) => {
      const payload = new Uint8Array(25)
      const view = new DataView(payload.buffer)
      view.setFloat32(0, value, true)
      view.setUint16(4, entries.length, true)
      view.setUint16(6, index, true)
      payload.set(new TextEncoder().encode(name).subarray(0, 16), 8)
      payload[24] = 9
      socket.write(this.#frame(MSG_PARAM_VALUE, payload))
    })
  }

  /** Sends the fix and the EKF of a vehicle that is ready to take off. */
  #sendReadiness(): void {
    if (!this.#ready || this.#silent) {
      return
    }
    const gps = new Uint8Array(30)
    gps[28] = FIX_3D
    gps[29] = 12
    this.#send(this.#frame(MSG_GPS_RAW_INT, gps))
    const ekf = new Uint8Array(22)
    new DataView(ekf.buffer).setUint16(20, EKF_READY, true)
    this.#send(this.#frame(MSG_EKF_STATUS_REPORT, ekf))
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
    new DataView(payload.buffer).setUint32(0, this.#mode, true)
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
