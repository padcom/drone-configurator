// Starts ArduPilot SITL for E2E tests: one vehicle type and frame at a time, on free ports, in its own
// working directory with a fresh EEPROM. It only ever launches a simulator.
//
// SITL_BINARY      the SITL executable (default: `arducopter` on the PATH)
// SITL_ENDPOINT    an already-running simulator to use instead (see endpoint.ts); nothing is launched
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, createConnection, type Socket } from 'node:net'
import { createSocket } from 'node:dgram'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { type Endpoint, parseEndpoint } from './endpoint'
import { MAV_AUTOPILOT_ARDUPILOTMEGA, FrameReader, asHeartbeat, asParamValue, encodeParamSet } from './mavlink-wire'

/** The vehicle types SITL can be started for. One at a time: a test names its vehicle. */
export const vehicles = {
  copter: { binary: 'arducopter', frames: ['quad', 'x', 'hexa', 'octa', 'tri', 'deca'] },
} as const

export type VehicleName = keyof typeof vehicles

export interface SitlOptions {
  /** @default 'copter' */
  vehicle?: VehicleName
  /** SITL's `--model`. @default 'quad' */
  frame?: string
  /** How many times faster than real time the simulation runs. @default 1 */
  speedup?: number
  /** SIM_* parameters to set once it is up, for example `{ SIM_WIND_SPD: 8 }`. */
  simParams?: Record<string, number>
  /** How long it may take to answer with a heartbeat. @default 60_000 */
  startTimeoutMs?: number
}

/** A SITL instance that is up and answering MAVLink on TCP. */
export interface Sitl {
  /** Where the dashboard connects (SERIAL0). */
  readonly endpoint: Endpoint
  readonly pid: number
  /** SITL's working directory: its EEPROM, logs and terrain. */
  readonly directory: string
  /** Sets a parameter, usually a `SIM_*` one, and waits for the vehicle to report the value it now has. */
  setParam(name: string, value: number): Promise<void>
  /** Stops it and removes its directory. Safe to call again. */
  stop(): Promise<void>
}

/** ArduPilot SITL's ports for an instance: each instance moves all of them by 10. */
export function instancePorts(instance: number): { tcp: number[]; udp: number[] } {
  return {
    // SERIAL0 is the base port; SERIAL1 and SERIAL2 are 2 and 3 above it.
    tcp: [0, 1, 2, 3].map(offset => 5760 + 10 * instance + offset),
    udp: [5501, 5502, 5503].map(port => port + 10 * instance),
  }
}

/** The command line for SITL. */
export function sitlArguments(options: { instance: number; frame: string; speedup: number }): string[] {
  return ['-w', '--model', options.frame, '--speedup', String(options.speedup), '-I', String(options.instance), '--sim-address=127.0.0.1']
}

/** How a test that needs SITL behaves when it isn't there: it fails in CI and is skipped elsewhere. */
export function missingSitlPolicy(env: NodeJS.ProcessEnv): 'fail' | 'skip' {
  return env.CI && env.CI !== 'false' && env.CI !== '0' ? 'fail' : 'skip'
}

/**
 * Finds the SITL executable.
 *
 * @param vehicle the vehicle type
 * @param env the environment to read SITL_BINARY and PATH from
 * @returns its path, or why it isn't there
 */
export function findSitlBinary(vehicle: VehicleName, env: NodeJS.ProcessEnv = process.env): { path: string } | { missing: string } {
  const configured = env.SITL_BINARY
  if (configured) {
    return existsSync(configured) ? { path: configured } : { missing: `SITL_BINARY is ${configured}, which does not exist` }
  }
  const name = vehicles[vehicle].binary
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, name)
    if (directory && existsSync(candidate)) {
      return { path: candidate }
    }
  }

  return { missing: `no ${name} on the PATH and SITL_BINARY is not set (build it: ./waf configure --board sitl && ./waf ${vehicle})` }
}

/** What a test run can use: a simulator that is already running, or one it can launch. */
export type SitlSupply = { kind: 'endpoint'; endpoint: Endpoint } | { kind: 'launch'; binary: string } | { kind: 'missing'; reason: string }

/** @returns how this run gets a simulator */
export function sitlSupply(vehicle: VehicleName = 'copter', env: NodeJS.ProcessEnv = process.env): SitlSupply {
  if (env.SITL_ENDPOINT) {
    return { kind: 'endpoint', endpoint: parseEndpoint(env.SITL_ENDPOINT) }
  }
  const found = findSitlBinary(vehicle, env)

  return 'path' in found ? { kind: 'launch', binary: found.path } : { kind: 'missing', reason: found.missing }
}

function tcpFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

function udpFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createSocket('udp4')
    socket.once('error', () => resolve(false))
    socket.bind(port, '127.0.0.1', () => socket.close(() => resolve(true)))
  })
}

/**
 * @param taken instances other callers in this process are about to use
 * @returns the lowest SITL instance number whose ports are all free
 * @throws Error if there is none
 */
export async function freeInstance(taken: ReadonlySet<number> = new Set()): Promise<number> {
  for (let instance = 0; instance < 100; instance += 1) {
    if (taken.has(instance)) {
      continue
    }
    const { tcp, udp } = instancePorts(instance)
    const free = await Promise.all([...tcp.map(tcpFree), ...udp.map(udpFree)])
    if (free.every(Boolean)) {
      return instance
    }
  }
  throw new Error('no free SITL instance: ports 5760-6759 and 5501-6500 are all in use')
}

const claimed = new Set<number>()
const running = new Set<ChildProcess>()
process.once('exit', () => {
  for (const child of running) {
    child.kill('SIGKILL')
  }
})

function connect(port: number, timeoutMs: number, alive: () => boolean): Promise<Socket> {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => resolve(socket))
      socket.once('error', () => {
        socket.destroy()
        if (!alive()) {
          reject(new Error('SITL exited'))
        } else if (Date.now() > deadline) {
          reject(new Error(`nothing listened on 127.0.0.1:${port} within ${timeoutMs} ms`))
        } else {
          setTimeout(attempt, 200)
        }
      })
    }
    attempt()
  })
}

function waitForHeartbeat(socket: Socket, timeoutMs: number): Promise<void> {
  const reader = new FrameReader()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no heartbeat within ${timeoutMs} ms`)), timeoutMs)
    socket.on('data', (data: Buffer) => {
      const heartbeat = reader.push(data).map(asHeartbeat).find(Boolean)
      if (heartbeat?.autopilot === MAV_AUTOPILOT_ARDUPILOTMEGA) {
        clearTimeout(timer)
        resolve()
      }
    })
    socket.once('close', () => {
      clearTimeout(timer)
      reject(new Error('the connection closed before a heartbeat'))
    })
  })
}

async function exited(child: ChildProcess): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise<void>(resolve => child.once('exit', () => resolve()))
  }
}

/**
 * Starts a simulator and waits until it answers with a heartbeat. If that fails, nothing is left running
 * and the error says why, with the end of SITL's own output.
 *
 * @param options what to start
 * @returns the running simulator. Stop it, in `finally` or `afterAll`.
 * @throws Error if it can't be launched or doesn't come up
 */
export async function startSitl(options: SitlOptions = {}): Promise<Sitl> {
  const { vehicle = 'copter', frame = 'quad', speedup = 1, simParams = {}, startTimeoutMs = 60_000 } = options
  if (!(vehicles[vehicle].frames as readonly string[]).includes(frame)) {
    throw new Error(`SITL: ${vehicle} has no frame ${JSON.stringify(frame)} (known: ${vehicles[vehicle].frames.join(', ')})`)
  }
  if (!(speedup > 0 && speedup <= 100)) {
    throw new Error(`SITL: speedup must be above 0 and at most 100, not ${speedup}`)
  }
  const found = findSitlBinary(vehicle)
  if (!('path' in found)) {
    throw new Error(`SITL: ${found.missing}`)
  }

  const instance = await freeInstance(claimed)
  claimed.add(instance)
  const directory = await mkdtemp(join(tmpdir(), 'sitl-'))
  const child = spawn(found.path, sitlArguments({ instance, frame, speedup }), { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  running.add(child)
  let output = ''
  const remember = (data: Buffer) => {
    output = (output + data.toString()).slice(-4000)
  }
  child.stdout.on('data', remember)
  child.stderr.on('data', remember)
  let spawnError: Error | undefined
  child.once('error', error => {
    spawnError = error
  })

  let stopped: Promise<void> | undefined
  const stop = () => {
    stopped ??= (async () => {
      child.kill('SIGKILL')
      await exited(child).catch(() => {})
      running.delete(child)
      claimed.delete(instance)
      await rm(directory, { recursive: true, force: true })
    })()

    return stopped
  }

  const port = instancePorts(instance).tcp
  const serial0 = port[0] ?? 5760
  const serial1 = port[2] ?? 5762
  const alive = () => !spawnError && child.exitCode === null && child.signalCode === null
  try {
    // SERIAL0 holds SITL back until somebody connects, so this is also what lets it boot.
    const socket = await connect(serial0, startTimeoutMs, alive)
    try {
      await waitForHeartbeat(socket, startTimeoutMs)
    } finally {
      socket.destroy()
    }
  } catch (error) {
    await stop()
    const why = error instanceof Error ? error.message : String(error)
    const exit = child.exitCode === null ? '' : ` (exit code ${child.exitCode})`
    throw new Error(`SITL (${found.path}, instance ${instance}) did not start: ${spawnError?.message ?? why}${exit}\n--- its output ---\n${output.trim() || '(none)'}`)
  }

  const sitl: Sitl = {
    endpoint: { transport: 'tcp', host: '127.0.0.1', port: serial0 },
    pid: child.pid ?? 0,
    directory,
    setParam: (name, value) => setParam(serial1, name, value, alive),
    stop,
  }
  try {
    for (const [name, value] of Object.entries(simParams)) {
      await sitl.setParam(name, value)
    }
  } catch (error) {
    await stop()
    throw error
  }

  return sitl
}

/** Sets a parameter over a short-lived connection to SERIAL1, so SERIAL0 stays free for the app under test. */
async function setParam(port: number, name: string, value: number, alive: () => boolean, timeoutMs = 10_000): Promise<void> {
  if (!alive()) {
    throw new Error(`SITL is not running, so ${name} can't be set`)
  }
  const socket = await connect(port, timeoutMs, alive)
  const reader = new FrameReader()
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`SITL did not confirm ${name} within ${timeoutMs} ms`)), timeoutMs)
      let target: { systemId: number; componentId: number } | undefined
      socket.on('data', (data: Buffer) => {
        for (const frame of reader.push(data)) {
          const heartbeat = asHeartbeat(frame)
          if (heartbeat?.autopilot === MAV_AUTOPILOT_ARDUPILOTMEGA && !target) {
            target = { systemId: heartbeat.systemId, componentId: heartbeat.componentId }
            socket.write(encodeParamSet(target, name, value))
          }
          const reported = asParamValue(frame)
          if (reported?.name === name) {
            clearTimeout(timer)
            if (Math.abs(reported.value - value) <= Math.abs(value) * 1e-6) {
              resolve()
            } else {
              reject(new Error(`SITL answered ${name} = ${reported.value}, not ${value}`))
            }
          }
        }
      })
      socket.once('close', () => {
        clearTimeout(timer)
        reject(new Error('the connection closed before SITL confirmed the parameter'))
      })
    })
  } finally {
    socket.destroy()
  }
}

/**
 * Runs a test body against a fresh SITL and always stops it, whether the body returns or throws.
 *
 * @param options what to start
 * @param body the test
 * @returns what the body returns
 */
export async function withSitl<T>(options: SitlOptions, body: (sitl: Sitl) => Promise<T>): Promise<T> {
  const sitl = await startSitl(options)
  try {
    return await body(sitl)
  } finally {
    await sitl.stop()
  }
}
