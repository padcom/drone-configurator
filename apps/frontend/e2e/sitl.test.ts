// The harness's logic, with no SITL: the wire format, the choices, and how it fails.
import { spawn } from 'node:child_process'
import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, isAbsolute, join, relative as relativePath } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FrameReader, MSG_HEARTBEAT, MSG_PARAM_VALUE, asCommandAck, asHeartbeat, asParamValue, asRelativeAltitude, crc16, crc32, encodeCommandLong, encodeFrame,
  encodeParamSet,
} from './mavlink-wire'
import {
  claimInstance, cleanupAllSync, defaultsFile, findSitlBinary, flightStep, instancePorts, missingSitlPolicy, shippedDefaults, signalHandlers, sitlArguments, sitlSupply,
  startSitl,
} from './sitl'

describe('the MAVLink wire format', () => {
  it('computes the X.25 CRC', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x6f_91)
  })

  it('computes the CRC-32 of the file transfer: the usual one with no inversion at either end', () => {
    const bytes = new TextEncoder().encode('123456789')
    // The usual CRC-32 of "123456789" is 0xcbf43926: seeded with all ones, and inverted at the end.
    expect((crc32(bytes, 0xff_ff_ff_ff) ^ 0xff_ff_ff_ff) >>> 0).toBe(0xcb_f4_39_26)
    // It carries on: the CRC of a file is the CRC of its first part carried on over the rest.
    expect(crc32(bytes.subarray(4), crc32(bytes.subarray(0, 4)))).toBe(crc32(bytes))
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  const heartbeat = Uint8Array.of(0, 0, 0, 0, 2, 3, 81, 4, 3)

  it('reads a heartbeat back, however the bytes are split', () => {
    const bytes = encodeFrame(MSG_HEARTBEAT, heartbeat, { systemId: 1, componentId: 1 })
    const reader = new FrameReader()
    expect(reader.push(bytes.subarray(0, 5))).toEqual([])
    const [frame] = reader.push(bytes.subarray(5))
    expect(frame && asHeartbeat(frame)).toEqual({ systemId: 1, componentId: 1, type: 2, autopilot: 3, armed: false, customMode: 0 })
  })

  it('reads the armed flag and the flight mode of a heartbeat', () => {
    // custom_mode 4 (GUIDED), base_mode 0xd1 (armed, custom mode enabled, ...).
    const armed = Uint8Array.of(4, 0, 0, 0, 2, 3, 0xd1, 4, 3)
    const [frame] = new FrameReader().push(encodeFrame(MSG_HEARTBEAT, armed, { systemId: 1, componentId: 1 }))
    expect(frame && asHeartbeat(frame)).toMatchObject({ armed: true, customMode: 4 })
  })

  it('writes a COMMAND_LONG that reads back, and reads an ack and a height', () => {
    const sent = encodeCommandLong({ systemId: 1, componentId: 1 }, 400, [1])
    const [command] = new FrameReader().push(sent)
    expect(command?.messageId).toBe(76)
    // The seven parameters (the first is 1), the command (400) after them, the target after that.
    const view = new DataView(command?.payload.buffer ?? new ArrayBuffer(0), command?.payload.byteOffset)
    expect([view.getFloat32(0, true), view.getUint16(28, true), command?.payload[30], command?.payload[31]]).toEqual([1, 400, 1, 1])
    const ack = new FrameReader().push(encodeFrame(77, Uint8Array.of(0x90, 0x01, 0), { systemId: 1, componentId: 1 }))[0]
    expect(ack && asCommandAck(ack)).toEqual({ command: 400, result: 0 })
    const position = new Uint8Array(28)
    new DataView(position.buffer).setInt32(16, 8224, true)
    const height = new FrameReader().push(encodeFrame(33, position, { systemId: 1, componentId: 1 }))[0]
    expect(height && asRelativeAltitude(height)).toBe(8224)
  })

  it('asks for the next command of a flight: guided and armed, then up, then land', () => {
    const base = { armed: false, mode: -1, heightMm: 0, wasHigh: false, wasArmed: false }
    expect(flightStep(base).map(step => step.command)).toEqual([176, 400])
    expect(flightStep({ ...base, armed: true, wasArmed: true }).map(step => step.command)).toEqual([22])
    expect(flightStep({ ...base, armed: true, wasArmed: true, wasHigh: true, mode: 4 }).map(step => step.command)).toEqual([176])
    expect(flightStep({ ...base, armed: true, wasArmed: true, wasHigh: true, mode: 9 })).toEqual([])
  })

  it('reads several frames from one chunk and skips garbage and bad CRCs', () => {
    const good = encodeFrame(MSG_HEARTBEAT, heartbeat, { systemId: 1, componentId: 1 })
    const bad = good.slice()
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 0xff
    const joined = Uint8Array.from([0x00, 0x11, ...bad, 0x22, ...good, ...good])
    expect(new FrameReader().push(joined)).toHaveLength(2)
  })

  it('reads a heartbeat whose zero tail MAVLink 2 trimmed', () => {
    const bytes = encodeFrame(MSG_HEARTBEAT, Uint8Array.of(0, 0, 0, 0, 2, 3), { systemId: 7, componentId: 1 })
    const [frame] = new FrameReader().push(bytes)
    expect(frame && asHeartbeat(frame)?.autopilot).toBe(3)
  })

  it('skips the signature of a signed frame', () => {
    const unsigned = encodeFrame(MSG_HEARTBEAT, heartbeat, { systemId: 1, componentId: 1 })
    // Flag it as signed and add a signature; the CRC covers the flag, so rebuild it.
    const signed = new Uint8Array(unsigned.length + 13)
    signed.set(unsigned)
    signed[2] = 1
    const crc = crc16(Uint8Array.of(50), crc16(signed.subarray(1, 10 + heartbeat.length)))
    signed[10 + heartbeat.length] = crc & 0xff
    signed[11 + heartbeat.length] = crc >> 8
    const frames = new FrameReader().push(Uint8Array.from([...signed, ...unsigned]))
    expect(frames).toHaveLength(2)
  })

  it('builds a PARAM_SET with the name, the value and the target', () => {
    const [frame] = new FrameReader().push(encodeFrame(MSG_PARAM_VALUE, new Uint8Array(25), { systemId: 1, componentId: 1 }))
    expect(frame && asParamValue(frame)).toEqual({ name: '', value: 0 })

    const bytes = encodeParamSet({ systemId: 1, componentId: 2 }, 'SIM_WIND_SPD', 8.5)
    expect(bytes[0]).toBe(0xfd)
    expect(bytes[1]).toBe(23)
    expect(bytes[7]).toBe(23)
    expect(new DataView(bytes.buffer).getFloat32(10, true)).toBe(8.5)
    expect([bytes[14], bytes[15]]).toEqual([1, 2])
    expect(new TextDecoder().decode(bytes.subarray(16, 28))).toBe('SIM_WIND_SPD')
  })

  it('refuses a parameter name that cannot exist', () => {
    expect(() => encodeParamSet({ systemId: 1, componentId: 1 }, '', 1)).toThrow('not a parameter name')
    expect(() => encodeParamSet({ systemId: 1, componentId: 1 }, 'A'.repeat(17), 1)).toThrow('not a parameter name')
  })
})

describe('SITL ports and arguments', () => {
  it('moves every port of an instance by 10', () => {
    expect(instancePorts(0)).toEqual({ tcp: [5760, 5761, 5762, 5763], udp: [5501, 5502, 5503] })
    expect(instancePorts(2).tcp[0]).toBe(5780)
    expect(instancePorts(2).udp[0]).toBe(5521)
  })

  it('wipes the EEPROM and names the frame, speed and instance', () => {
    expect(sitlArguments({ instance: 3, frame: 'hexa', speedup: 4 })).toEqual(['-w', '--model', 'hexa', '--speedup', '4', '-I', '3', '--sim-address=127.0.0.1'])
  })


  it('writes the parameters a test starts SITL with, one on a line, and refuses what is not one', () => {
    expect(defaultsFile({ INS_LOG_BAT_MASK: 1, LOG_FILE_DSRMROT: 1 })).toBe('INS_LOG_BAT_MASK 1\nLOG_FILE_DSRMROT 1\n')
    expect(defaultsFile({})).toBe('')
    expect(() => defaultsFile({ 'bad name': 1 })).toThrow('not a parameter')
    expect(() => defaultsFile({ ABC: Number.NaN })).toThrow('not a parameter')
  })

  it('passes the default parameter files, comma separated, when it has them', () => {
    expect(sitlArguments({ instance: 0, frame: 'x', speedup: 1, defaults: ['/d/copter.parm', '/d/copter-X.parm'] })).toEqual([
      '-w', '--model', 'x', '--speedup', '1', '-I', '0', '--sim-address=127.0.0.1', '--defaults', '/d/copter.parm,/d/copter-X.parm',
    ])
    expect(sitlArguments({ instance: 0, frame: 'x', speedup: 1, defaults: [] })).not.toContain('--defaults')
  })

  it.skipIf(process.platform === 'win32')('finds the default parameter files in the source tree of a build made by hand, with absolute paths', async () => {
    const tree = await mkdtemp(join(tmpdir(), 'sitl-path-'))
    try {
      await mkdir(join(tree, 'build', 'sitl', 'bin'), { recursive: true })
      await mkdir(join(tree, 'Tools', 'autotest', 'default_params'), { recursive: true })
      await writeFile(join(tree, 'Tools', 'autotest', 'default_params', 'copter.parm'), '')
      const binary = join(tree, 'build', 'sitl', 'bin', 'arducopter')
      const relative = relativePath(process.cwd(), binary)
      expect(shippedDefaults(relative, 'quad')).toEqual([join(tree, 'Tools', 'autotest', 'default_params', 'copter.parm')])
    } finally {
      await rm(tree, { recursive: true })
    }
  })

  it('finds the default parameter files a build ships next to its executable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sitl-path-'))
    try {
      const binary = join(directory, 'arducopter')
      expect(shippedDefaults(binary, 'quad')).toEqual([])
      await mkdir(join(directory, 'default_params'))
      await writeFile(join(directory, 'default_params', 'copter.parm'), 'BATT_MONITOR 4\n')
      expect(shippedDefaults(binary, 'quad')).toEqual([join(directory, 'default_params', 'copter.parm')])
      // The frame's own file is missing, so the build is treated as shipping none rather than half.
      expect(shippedDefaults(binary, 'x')).toEqual([])
      await writeFile(join(directory, 'default_params', 'copter-X.parm'), '')
      expect(shippedDefaults(binary, 'x')).toEqual([join(directory, 'default_params', 'copter.parm'), join(directory, 'default_params', 'copter-X.parm')])
      expect(shippedDefaults(binary, 'zeppelin')).toEqual([])
    } finally {
      await rm(directory, { recursive: true })
    }
  })
})

// These tests claim instances from here on, in a lock directory of their own, so that nothing running on the machine (a SITL on
// instance 0, or with any -I or --base-port, which the leader and QA start for their own work) can change their result: no
// port of instance 0 to 99 is looked at.
const FIRST = 300

/**
 * Makes the claims of a test its own: a lock directory of its own, and instances from FIRST on.
 *
 * @param directory the lock directory
 */
function ownInstances(directory: string): void {
  vi.stubEnv('SITL_LOCK_DIR', directory)
  vi.stubEnv('SITL_FIRST_INSTANCE', String(FIRST))
}

describe('claiming an instance', () => {
  const lockDirectories: string[] = []

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sitl-locktest-'))
    lockDirectories.push(directory)
    ownInstances(directory)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(lockDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  it('skips an instance whose port is taken', async () => {
    const server = createServer()
    await new Promise<void>(resolve => server.listen(instancePorts(FIRST).tcp[0], '127.0.0.1', resolve))
    try {
      const claim = await claimInstance()
      expect(claim.instance).toBeGreaterThan(FIRST)
      claim.release()
    } finally {
      server.close()
    }
  })

  it('does not hand out an instance that is claimed, and hands it out again once released', async () => {
    const first = await claimInstance()
    const second = await claimInstance()
    expect(second.instance).not.toBe(first.instance)
    first.release()
    first.release()
    const third = await claimInstance()
    expect(third.instance).toBe(first.instance)
    second.release()
    third.release()
  })

  it('does not hand out an instance that another process holds', async () => {
    // A live process other than this one: our parent. It stands for a parallel worker.
    await writeFile(join(process.env.SITL_LOCK_DIR ?? '', `instance-${FIRST}`), String(process.ppid))
    const claim = await claimInstance()
    expect(claim.instance).toBeGreaterThan(FIRST)
    claim.release()
  })

  it('takes over an instance whose owner died without releasing it', async () => {
    const dead = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => dead.once('exit', resolve))
    await writeFile(join(process.env.SITL_LOCK_DIR ?? '', `instance-${FIRST}`), String(dead.pid))
    const claim = await claimInstance()
    expect(claim.instance).toBe(FIRST)
    claim.release()
  })

  it('treats an empty or unreadable lock as held, and leaves it alone', async () => {
    const empty = join(process.env.SITL_LOCK_DIR ?? '', `instance-${FIRST}`)
    const garbled = join(process.env.SITL_LOCK_DIR ?? '', `instance-${FIRST + 1}`)
    await writeFile(empty, '')
    await writeFile(garbled, 'not a pid')
    const claim = await claimInstance()
    expect(claim.instance).toBeGreaterThan(FIRST + 1)
    expect(await readFile(empty, 'utf8')).toBe('')
    expect(await readFile(garbled, 'utf8')).toBe('not a pid')
    claim.release()
  })

  it('never shows a lock without its owner in it', async () => {
    const file = join(process.env.SITL_LOCK_DIR ?? '', `instance-${FIRST}`)
    const seen = new Set<string>()
    const watching = (async () => {
      for (let i = 0; i < 400; i += 1) {
        seen.add(await readFile(file, 'utf8').catch(() => 'missing'))
        await new Promise(resolve => setImmediate(resolve))
      }
    })()
    const claim = await claimInstance()
    await watching
    expect(claim.instance).toBe(FIRST)
    expect(seen.has('')).toBe(false)
    claim.release()
  })

  it('lets only one worker take over a dead one lock', async () => {
    const dead = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => dead.once('exit', resolve))
    const file = join(process.env.SITL_LOCK_DIR ?? '', `instance-${FIRST}`)
    await writeFile(file, String(dead.pid))
    // Another worker is in the middle of taking it over.
    await mkdir(`${file}.takeover`)
    const claim = await claimInstance()
    expect(claim.instance).toBeGreaterThan(FIRST)
    expect(await readFile(file, 'utf8')).toBe(String(dead.pid))
    claim.release()
  })

  it('releases only a lock that is still its own', async () => {
    const claim = await claimInstance()
    const file = join(process.env.SITL_LOCK_DIR ?? '', `instance-${claim.instance}`)
    await writeFile(file, String(process.ppid))
    claim.release()
    expect(await readFile(file, 'utf8')).toBe(String(process.ppid))
  })

  it('gives two callers at once two different instances', async () => {
    const claims = await Promise.all([claimInstance(), claimInstance(), claimInstance()])
    expect(new Set(claims.map(claim => claim.instance)).size).toBe(3)
    claims.forEach(claim => claim.release())
  })
})

describe('whether SITL is there', () => {
  it('fails in CI and skips elsewhere', () => {
    expect(missingSitlPolicy({ CI: 'true' })).toBe('fail')
    expect(missingSitlPolicy({ CI: '1' })).toBe('fail')
    expect(missingSitlPolicy({})).toBe('skip')
    expect(missingSitlPolicy({ CI: 'false' })).toBe('skip')
    expect(missingSitlPolicy({ CI: '' })).toBe('skip')
  })

  it('prefers a running simulator named by SITL_ENDPOINT, and launches nothing', () => {
    expect(sitlSupply('copter', { SITL_ENDPOINT: 'tcp:127.0.0.1:5760', SITL_BINARY: '/nope' })).toEqual({
      kind: 'endpoint',
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 5760 },
    })
  })

  it('says why it is missing', () => {
    expect(findSitlBinary('copter', { SITL_BINARY: '/does/not/exist' })).toEqual({ missing: 'SITL_BINARY is /does/not/exist, which does not exist' })
    const missing = sitlSupply('copter', { PATH: '/does/not/exist' })
    expect(missing).toMatchObject({ kind: 'missing' })
    expect(missing.kind === 'missing' && missing.reason).toContain('no arducopter on the PATH')
  })

  // On Windows the temp directory can be on another drive than the repo, where no relative path exists.
  it.skipIf(process.platform === 'win32')('makes a relative SITL_BINARY absolute', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sitl-path-'))
    try {
      const binary = join(directory, 'arducopter')
      await writeFile(binary, '')
      const relative = relativePath(process.cwd(), binary)
      expect(isAbsolute(relative)).toBe(false)
      expect(findSitlBinary('copter', { SITL_BINARY: relative })).toEqual({ path: binary })
    } finally {
      await rm(directory, { recursive: true })
    }
  })

  it('finds it on the PATH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sitl-path-'))
    try {
      await writeFile(join(directory, 'arducopter'), '')
      expect(findSitlBinary('copter', { PATH: `/does/not/exist${delimiter}${directory}` })).toEqual({ path: join(directory, 'arducopter') })
    } finally {
      await rm(directory, { recursive: true })
    }
  })
})

// These run stand-in executables (a script with a #! line), which Windows can't. Windows is not a gate for #9.
describe.skipIf(process.platform === 'win32')('a SITL that is cut short', () => {
  const directories: string[] = []

  beforeEach(async () => {
    const lockDirectory = await mkdtemp(join(tmpdir(), 'sitl-locktest-'))
    const fakeDirectory = await mkdtemp(join(tmpdir(), 'sitl-fake-'))
    directories.push(lockDirectory, fakeDirectory)
    ownInstances(lockDirectory)
    // A stand-in that listens on SERIAL0 of its instance and sends heartbeats, as the real one does.
    const heartbeat = encodeFrame(MSG_HEARTBEAT, Uint8Array.of(0, 0, 0, 0, 2, 3, 81, 4, 3), { systemId: 1, componentId: 1 })
    vi.stubEnv('FAKE_HEARTBEAT_HEX', Buffer.from(heartbeat).toString('hex'))
    const binary = join(fakeDirectory, 'arducopter')
    await writeFile(
      binary,
      `#!${process.execPath}
const args = process.argv.slice(2)
const instance = Number(args[args.indexOf('-I') + 1])
const heartbeat = Buffer.from(process.env.FAKE_HEARTBEAT_HEX, 'hex')
require('node:net').createServer(socket => { socket.on('error', () => {}); setInterval(() => socket.write(heartbeat), 100) }).listen(5760 + 10 * instance, '127.0.0.1')
`,
    )
    await chmod(binary, 0o755)
    vi.stubEnv('SITL_BINARY', binary)
  })

  afterEach(async () => {
    cleanupAllSync()
    vi.unstubAllEnvs()
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  const alive = (pid: number) => {
    try {
      process.kill(pid, 0)

      return true
    } catch {
      return false
    }
  }

  it('is killed, its directory removed and its instance given back when the process is going down', async () => {
    const sitl = await startSitl({ startTimeoutMs: 10_000 })
    expect(alive(sitl.pid)).toBe(true)
    await expect(access(sitl.directory)).resolves.toBeUndefined()
    const locks = join(process.env.SITL_LOCK_DIR ?? '', `instance-${FIRST}`)
    await expect(access(locks)).resolves.toBeUndefined()

    cleanupAllSync()

    await vi.waitFor(() => expect(alive(sitl.pid)).toBe(false))
    await expect(access(sitl.directory)).rejects.toThrow()
    await expect(access(locks)).rejects.toThrow()
  })

  it('has handlers for the signals that end a run, which clean up before the signal takes effect', () => {
    expect([...signalHandlers.keys()].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM'])
    for (const [signal, handler] of signalHandlers) {
      expect(handler).toBeTypeOf('function')
      expect(process.listeners(signal)).toContain(handler)
    }
  })

  it('starts from a relative SITL_BINARY, though SITL runs in another directory', async () => {
    const relative = relativePath(process.cwd(), process.env.SITL_BINARY ?? '')
    expect(isAbsolute(relative)).toBe(false)
    vi.stubEnv('SITL_BINARY', relative)
    const sitl = await startSitl({ startTimeoutMs: 10_000 })
    expect(alive(sitl.pid)).toBe(true)
    await sitl.stop()
  })

  it('starts two in a row on different instances and stops them cleanly', async () => {
    const first = await startSitl({ startTimeoutMs: 10_000 })
    const second = await startSitl({ startTimeoutMs: 10_000 })
    expect(second.endpoint.port).not.toBe(first.endpoint.port)
    await Promise.all([first.stop(), second.stop()])
    expect(alive(first.pid) || alive(second.pid)).toBe(false)
  })
})

describe.skipIf(process.platform === 'win32')('a SITL that does not start', () => {
  const directories: string[] = []

  beforeEach(async () => {
    const lockDirectory = await mkdtemp(join(tmpdir(), 'sitl-locktest-'))
    directories.push(lockDirectory)
    ownInstances(lockDirectory)
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
  })

  async function fakeSitl(script: string): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'sitl-fake-'))
    directories.push(directory)
    const binary = join(directory, 'arducopter')
    await writeFile(binary, `#!/bin/sh\n${script}\n`)
    await chmod(binary, 0o755)
    vi.stubEnv('SITL_BINARY', binary)
  }

  const sitlDirectories = async () => (await readdir(tmpdir())).filter(name => name.startsWith('sitl-') && !/^sitl-(fake|path|lock)/u.test(name))

  it('says why, with its output, and leaves no directory behind', async () => {
    await fakeSitl('echo "no such model" >&2; exit 3')
    const before = await sitlDirectories()
    await expect(startSitl({ startTimeoutMs: 5000 })).rejects.toThrow(/did not start.*exit code 3[\s\S]*no such model/u)
    expect(await sitlDirectories()).toEqual(before)
  })

  it('stops a SITL that runs but never listens', async () => {
    await fakeSitl('exec sleep 30')
    await expect(startSitl({ startTimeoutMs: 600 })).rejects.toThrow(/did not start.*nothing listened/u)
  })

  it('refuses a frame or speed it does not know before launching anything', async () => {
    await fakeSitl('exit 0')
    await expect(startSitl({ frame: 'zeppelin' })).rejects.toThrow('has no frame "zeppelin"')
    await expect(startSitl({ speedup: 0 })).rejects.toThrow('speedup must be above 0')
  })

  it('names the missing binary', async () => {
    vi.stubEnv('SITL_BINARY', '/does/not/exist')
    await expect(startSitl()).rejects.toThrow('SITL_BINARY is /does/not/exist')
  })
})
