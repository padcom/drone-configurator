// The simulated vehicle behind a real TCP port (apps/backend/e2e/tcp-vehicle.pi), for E2E tests.
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
 * @returns the environment
 */
function environment(withLogs: boolean, withSetup: boolean): NodeJS.ProcessEnv {
  return { ...process.env, ...withLogs ? { VEHICLE_LOGS: '1' } : {}, ...withSetup ? { VEHICLE_SETUP: '1' } : {} }
}

/** The simulated vehicle, as a child process listening on a TCP port. */
export class TcpVehicle {
  /** How many PARAM_SET messages it has received. */
  writes = 0
  /** How many motor test commands it has received that start a motor, and that stop one. */
  motorStarts = 0
  motorStops = 0
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
   * @returns the running vehicle, with its port known
   */
  static async start(withLogs = false, withSetup = false): Promise<TcpVehicle> {
    await promisify(execFile)('pico', ['build', source, '-o', binary])
    const env = environment(withLogs, withSetup)
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
    } else if (line === 'motor-start') {
      this.motorStarts += 1
    } else if (line === 'motor-stop') {
      this.motorStops += 1
    }
  }
}
