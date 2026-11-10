// Starts ArduPilot SITL for E2E tests: one vehicle type and frame at a time, on free ports, in its own
// working directory with a fresh EEPROM. It only ever launches a simulator.
//
// SITL_BINARY      the SITL executable (default: `arducopter` on the PATH)
// SITL_ENDPOINT    an already-running simulator to use instead (see endpoint.ts); nothing is launched
import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, createConnection, type Socket } from 'node:net'
import { createSocket } from 'node:dgram'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve as absolute } from 'node:path'
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

/** The default parameter files of each Copter frame, as ArduPilot's Tools/autotest/pysim/vehicleinfo.json names them. */
const copterDefaults: Record<string, string[]> = {
  quad: ['copter.parm'],
  x: ['copter.parm', 'copter-X.parm'],
  hexa: ['copter.parm', 'copter-hexa.parm'],
  octa: ['copter.parm', 'copter-octa.parm'],
  tri: ['copter.parm', 'copter-tri.parm'],
  deca: ['copter.parm', 'copter-deca.parm'],
}

/**
 * The default parameter files for a frame, if the build ships them in a `default_params` directory next to
 * the executable (.github/sitl-build.sh does). Newer SITL builds carry their defaults inside; older ones,
 * such as Copter 4.7, start with none (so, for one, no battery monitor, and then no BATT_* parameters).
 *
 * A tree built by hand has them in its source instead: `Tools/autotest/default_params`, three directories
 * above `build/sitl/bin/<executable>`. That is looked at second.
 *
 * @param binary the SITL executable
 * @param frame SITL's `--model`
 * @returns absolute paths (SITL runs in another directory), or none if the build doesn't ship them
 */
export function shippedDefaults(binary: string, frame: string): string[] {
  const beside = dirname(absolute(binary))
  const wanted = copterDefaults[frame] ?? []
  for (const directory of [join(beside, 'default_params'), absolute(beside, '..', '..', '..', 'Tools', 'autotest', 'default_params')]) {
    const files = wanted.map(file => join(directory, file))
    if (files.length > 0 && files.every(file => existsSync(file))) {
      return files
    }
  }

  return []
}

/** The command line for SITL. */
export function sitlArguments(options: { instance: number; frame: string; speedup: number; defaults?: readonly string[] }): string[] {
  const defaults = options.defaults?.length ? ['--defaults', options.defaults.join(',')] : []

  return ['-w', '--model', options.frame, '--speedup', String(options.speedup), '-I', String(options.instance), '--sim-address=127.0.0.1', ...defaults]
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
 * @returns its absolute path (it is started from another directory, where a relative one would not resolve), or why it isn't there
 */
export function findSitlBinary(vehicle: VehicleName, env: NodeJS.ProcessEnv = process.env): { path: string } | { missing: string } {
  const configured = env.SITL_BINARY
  if (configured) {
    return existsSync(configured) ? { path: absolute(configured) } : { missing: `SITL_BINARY is ${configured}, which does not exist` }
  }
  const name = vehicles[vehicle].binary
  for (const directory of (env.PATH ?? '').split(delimiter)) {
    const candidate = join(directory, name)
    if (directory && existsSync(candidate)) {
      return { path: absolute(candidate) }
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

/** Where instance claims are recorded, so that parallel workers (separate processes) don't pick the same one. */
function lockDirectory(): string {
  return process.env.SITL_LOCK_DIR || join(tmpdir(), 'sitl-locks')
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)

    return true
  } catch (error) {
    // EPERM: it exists, and is somebody else's.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** @returns the pid in a lock file, or 0 if it is missing, empty or not a pid */
async function lockOwner(file: string): Promise<number> {
  const owner = Number((await readFile(file, 'utf8').catch(() => '')).trim())

  return Number.isInteger(owner) && owner > 0 ? owner : 0
}

/**
 * Takes the lock file of an instance, or says it can't.
 *
 * The file appears already holding our pid: it is written under another name and hard-linked into place,
 * which fails if the lock exists. So nobody ever sees it empty. A lock whose contents we can't read as a pid
 * is somebody else's and counts as held. A lock whose owner has died (a killed run) is taken over, and only
 * one worker at a time may do that (a `.takeover` directory is the mutex), after checking again that it is
 * still the dead owner's.
 */
async function takeLock(file: string): Promise<boolean> {
  const mine = `${file}.${process.pid}.${randomUUID()}`
  await writeFile(mine, String(process.pid))
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await link(mine, file)

        return true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error
        }
      }
      const owner = await lockOwner(file)
      if (owner === 0 || processAlive(owner)) {
        return false
      }
      const guard = `${file}.takeover`
      try {
        await mkdir(guard)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          return false
        }
        throw error
      }
      try {
        if ((await lockOwner(file)) === owner) {
          await rm(file, { force: true })
        }
      } finally {
        await rm(guard, { recursive: true, force: true })
      }
    }

    return false
  } finally {
    await rm(mine, { force: true })
  }
}

/** Removes a lock file, but only if it is still ours. */
function releaseLock(file: string): void {
  try {
    if (readFileSync(file, 'utf8').trim() === String(process.pid)) {
      rmSync(file, { force: true })
    }
  } catch {
    // Already gone.
  }
}

/**
 * The first instance number that is tried (SITL_FIRST_INSTANCE, 0 by default). The harness's own tests start high, so that a
 * simulator that somebody runs on this machine (on instance 0, or on any -I or --base-port near it) is never in their way.
 *
 * @returns the instance number to start from
 */
function firstInstance(): number {
  const first = Number(process.env.SITL_FIRST_INSTANCE)

  return Number.isInteger(first) && first >= 0 ? first : 0
}

/** A SITL instance number that this caller, in any process, has to itself. */
export interface Claim {
  readonly instance: number
  /** Gives the instance back. Safe to call again. */
  release(): void
}

/**
 * Claims the lowest SITL instance (from SITL_FIRST_INSTANCE on) that no other worker holds and whose ports are all free. Holding it is
 * recorded in a lock file in the temp directory (SITL_LOCK_DIR), so it holds across processes; the port
 * probe also catches a simulator that something else started.
 *
 * @returns the claim. Release it when the simulator is gone.
 * @throws Error if there is none
 */
export async function claimInstance(): Promise<Claim> {
  await mkdir(lockDirectory(), { recursive: true })
  const first = firstInstance()
  for (let instance = first; instance < first + 100; instance += 1) {
    const file = join(lockDirectory(), `instance-${instance}`)
    if (!(await takeLock(file))) {
      continue
    }
    const release = () => releaseLock(file)
    const { tcp, udp } = instancePorts(instance)
    const free = await Promise.all([...tcp.map(tcpFree), ...udp.map(udpFree)])
    if (free.every(Boolean)) {
      return { instance, release }
    }
    release()
  }
  throw new Error('no free SITL instance: ports 5760-6759 and 5501-6500 are all in use or claimed')
}

interface Live {
  directory: string
  claim: Claim
}

/** Every simulator this process started and hasn't stopped. */
const live = new Map<ChildProcess, Live>()

/**
 * Kills every simulator this process started, removes their directories and gives their instances back.
 * Synchronous, so it can run when the process is going down. The exit and signal handlers call it.
 */
export function cleanupAllSync(): void {
  for (const [child, { directory, claim }] of live) {
    child.kill('SIGKILL')
    rmSync(directory, { recursive: true, force: true })
    claim.release()
  }
  live.clear()
}

/** SIGINT, SIGTERM and SIGHUP clean up, then let the signal do what it would have done. */
export const signalHandlers: ReadonlyMap<NodeJS.Signals, () => void> = new Map(
  (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map(signal => {
    const handler = () => {
      cleanupAllSync()
      process.removeListener(signal, handler)
      process.kill(process.pid, signal)
    }

    return [signal, handler]
  }),
)
process.once('exit', cleanupAllSync)
for (const [signal, handler] of signalHandlers) {
  process.once(signal, handler)
}

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

  const claim = await claimInstance()
  const { instance } = claim
  let directory: string
  let child: ChildProcess & { stdout: NonNullable<ChildProcess['stdout']>; stderr: NonNullable<ChildProcess['stderr']> }
  try {
    directory = await mkdtemp(join(tmpdir(), 'sitl-'))
    const defaults = shippedDefaults(found.path, frame)
    child = spawn(found.path, sitlArguments({ instance, frame, speedup, defaults }), { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    claim.release()
    throw error
  }
  live.set(child, { directory, claim })
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
      live.delete(child)
      try {
        await rm(directory, { recursive: true, force: true })
      } finally {
        claim.release()
      }
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
