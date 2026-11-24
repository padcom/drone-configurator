// The simulated vehicle behind a real TCP port (apps/backend/e2e/tcp-vehicle.pi), for E2E tests; or on a UDP port, or connecting
// to a TCP port of the app's (#197).
import { type ChildProcessByStdio, execFile, spawn } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { announcedPort } from './announced-port'

const source = fileURLToPath(new URL('../../backend/e2e/tcp-vehicle.pi', import.meta.url))
const binary = fileURLToPath(new URL('../../../.pico-desktop/e2e/tcp-vehicle', import.meta.url))

/**
 * What the child is told by its environment: the flags that give it logs, or the parameters of a Copter that was set up.
 *
 * @param withLogs whether it holds three flight logs and never arms
 * @param withSetup whether it has the Setup pages' parameters and never arms
 * @param prearm a pre-arm check that fails: an arm is refused with "PreArm: " and this text ('' for none)
 * @param at50Hz whether it sends its position, radio and outputs 50 times a second, and never arms
 * @returns the environment
 */
function environment(withLogs: boolean, withSetup: boolean, prearm: string, at50Hz: boolean): NodeJS.ProcessEnv {
  const flags = Object.entries({ VEHICLE_LOGS: withLogs, VEHICLE_SETUP: withSetup, VEHICLE_50HZ: at50Hz })
  const on = Object.fromEntries(flags.filter(([, set]) => set).map(([name]) => [name, '1']))
  const failing = prearm === '' ? {} : { VEHICLE_PREARM: prearm }

  return { ...process.env, ...on, ...failing }
}

/** The simulated vehicle, as a child process listening on a TCP port. */
export class TcpVehicle {
  /** How many PARAM_SET messages it has received. */
  writes = 0
  /** How many motor test commands it has received that start a motor, and that stop one. */
  motorStarts = 0
  motorStops = 0
  /** The interval (microseconds) it was last asked for each message: 0 when it was given back to its own rate. */
  readonly intervals = new Map<number, number>()
  /** The TCP port it listens on, once it has said so. */
  port = 0
  readonly #child: ChildProcessByStdio<Writable, Readable, null>
  #waiters: (() => void)[] = []

  private constructor(child: ChildProcessByStdio<Writable, Readable, null>) {
    this.#child = child
  }

  /**
   * Builds and starts it.
   *
   * @param withLogs whether it holds three flight logs and never arms (for the checks of the logs page)
   * @param withSetup whether it has the parameters of a Copter that was set up, and never arms (for the Setup pages)
   * @param prearm a pre-arm check that fails: an arm is refused with "PreArm: " and this text ('' for none)
   * @returns the running vehicle, with its port known
   */
  static start(withLogs = false, withSetup = false, prearm = ''): Promise<TcpVehicle> {
    return TcpVehicle.#launch(environment(withLogs, withSetup, prearm, false))
  }

  /**
   * Builds and starts one that sends its position, its radio's channels and its outputs 50 times a second and never arms (#26:
   * the app coalesces that for its page).
   *
   * @returns the running vehicle, with its port known
   */
  static startAt50Hz(): Promise<TcpVehicle> {
    return TcpVehicle.#launch(environment(false, false, '', true))
  }

  /**
   * Builds and starts one that listens on a UDP port instead, and answers whoever sent to it last (#197: the app's "udp-client").
   *
   * @returns the running vehicle, with its UDP port known
   */
  static startOverUdp(): Promise<TcpVehicle> {
    return TcpVehicle.#launch({ ...environment(false, false, '', false), VEHICLE_UDP: '1' })
  }

  /**
   * Builds and starts one that connects to a TCP port of 127.0.0.1, again whenever the connection ends (#197: the app's
   * "tcp-server"). It resolves once it has connected the first time.
   *
   * @param port the port it connects to
   * @returns the running vehicle (its `port` is that one)
   */
  static connectingTo(port: number): Promise<TcpVehicle> {
    return TcpVehicle.#launch({ ...environment(false, false, '', false), VEHICLE_CONNECT_TO: String(port) })
  }

  /**
   * Builds and starts it.
   *
   * @param env its environment
   * @returns the running vehicle, with its port known
   */
  static async #launch(env: NodeJS.ProcessEnv): Promise<TcpVehicle> {
    await promisify(execFile)('pico', ['build', source, '-o', binary])
    const vehicle = new TcpVehicle(spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'], env }))
    await vehicle.#listen()

    return vehicle
  }

  /**
   * Waits for the child to say which port it listens on; stops it if it can't.
   *
   * @throws {Error} if the child fails to start, exits first, or prints anything else
   */
  async #listen(): Promise<void> {
    try {
      this.port = await announcedPort(this.#child, line => this.#heard(line))
    } catch (error) {
      this.stop()
      throw error
    }
  }

  /** Makes the current connection's vehicle go silent: a write sent to it stays in flight. */
  mute() {
    this.#child.stdin.write('mute\n')
  }

  /**
   * Waits for the next PARAM_SET.
   *
   * @returns a promise that resolves when it arrives
   */
  nextWrite(): Promise<void> {
    return new Promise(resolve => {
      this.#waiters.push(resolve)
    })
  }

  /** Stops the vehicle. */
  stop() {
    this.#child.kill()
  }

  /**
   * Counts what the child says about the writes it receives.
   *
   * @param line a line the child printed after its port
   */
  #heard(line: string) {
    if (line === 'param-set') {
      this.writes += 1
      this.#waiters.splice(0).forEach(resolve => resolve())
    } else if (line.startsWith('interval ')) {
      const [, id, microseconds] = line.split(' ')
      this.intervals.set(Number(id), Number(microseconds))
    } else {
      this.#heardMotor(line)
    }
  }

  /**
   * Counts the motor test commands it says it received.
   *
   * @param line a line the child printed
   */
  #heardMotor(line: string) {
    if (line === 'motor-start') {
      this.motorStarts += 1
    } else if (line === 'motor-stop') {
      this.motorStops += 1
    }
  }
}
