// The simulated vehicle behind a real TCP port (apps/backend/e2e/tcp-vehicle.pi), for E2E tests.
import { type ChildProcessByStdio, execFile, spawn } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { announcedPort } from './announced-port'

const source = fileURLToPath(new URL('../../backend/e2e/tcp-vehicle.pi', import.meta.url))
const binary = fileURLToPath(new URL(`../../../.pico-desktop/e2e/tcp-vehicle${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url))

export class TcpVehicle {
  /** How many PARAM_SET messages it has received. */
  writes = 0
  port = 0
  readonly #child: ChildProcessByStdio<Writable, Readable, null>
  #waiters: (() => void)[] = []

  private constructor(child: ChildProcessByStdio<Writable, Readable, null>) {
    this.#child = child
  }

  /** Builds and starts it. */
  static async start(): Promise<TcpVehicle> {
    await promisify(execFile)('pico', ['build', source, '-o', binary])
    const vehicle = new TcpVehicle(spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'] }))
    try {
      vehicle.port = await announcedPort(vehicle.#child, line => vehicle.#heard(line))
    } catch (error) {
      vehicle.stop()
      throw error
    }

    return vehicle
  }

  /** Makes the current connection's vehicle go silent: a write sent to it stays in flight. */
  mute() {
    this.#child.stdin.write('mute\n')
  }

  /** Resolves when the next PARAM_SET arrives. */
  nextWrite(): Promise<void> {
    return new Promise(resolve => this.#waiters.push(resolve))
  }

  stop() {
    this.#child.kill()
  }

  #heard(line: string) {
    if (line === 'param-set') {
      this.writes += 1
      this.#waiters.splice(0).forEach(resolve => resolve())
    }
  }
}
