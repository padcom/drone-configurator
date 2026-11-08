// The harness's logic, with no SITL: the wire format, the choices, and how it fails.
import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FrameReader, MSG_HEARTBEAT, MSG_PARAM_VALUE, asHeartbeat, asParamValue, crc16, encodeFrame, encodeParamSet } from './mavlink-wire'
import { findSitlBinary, freeInstance, instancePorts, missingSitlPolicy, sitlArguments, sitlSupply, startSitl } from './sitl'

describe('the MAVLink wire format', () => {
  it('computes the X.25 CRC', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x6f_91)
  })

  const heartbeat = Uint8Array.of(0, 0, 0, 0, 2, 3, 81, 4, 3)

  it('reads a heartbeat back, however the bytes are split', () => {
    const bytes = encodeFrame(MSG_HEARTBEAT, heartbeat, { systemId: 1, componentId: 1 })
    const reader = new FrameReader()
    expect(reader.push(bytes.subarray(0, 5))).toEqual([])
    const [frame] = reader.push(bytes.subarray(5))
    expect(frame && asHeartbeat(frame)).toEqual({ systemId: 1, componentId: 1, type: 2, autopilot: 3 })
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

  it('skips an instance whose port is taken', async () => {
    const server = createServer()
    await new Promise<void>(resolve => server.listen(5760, '127.0.0.1', resolve))
    try {
      expect(await freeInstance()).toBeGreaterThan(0)
    } finally {
      server.close()
    }
  })

  it('does not hand out an instance a caller has claimed', async () => {
    const first = await freeInstance()
    expect(await freeInstance(new Set([first]))).not.toBe(first)
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

  it('finds it on the PATH', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sitl-path-'))
    try {
      await writeFile(join(directory, 'arducopter'), '')
      expect(findSitlBinary('copter', { PATH: `/does/not/exist:${directory}` })).toEqual({ path: join(directory, 'arducopter') })
    } finally {
      await rm(directory, { recursive: true })
    }
  })
})

describe('a SITL that does not start', () => {
  const directories: string[] = []

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

  const sitlDirectories = async () => (await readdir(tmpdir())).filter(name => name.startsWith('sitl-') && !name.startsWith('sitl-fake-') && !name.startsWith('sitl-path-'))

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
