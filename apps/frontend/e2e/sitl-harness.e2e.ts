// The harness itself, against real Copter SITL: it starts, takes parameters, runs fast, runs twice,
// and leaves no process, directory or port behind, even when a test fails.
import { access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { expect, it } from 'vitest'
import { type Sitl, startSitl, withSitl } from './sitl'
import { describeSitl } from './sitl-suite'

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

const listening = (port: number) =>
  new Promise<boolean>(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

describeSitl(
  'the SITL harness',
  () => {
    it('starts Copter, which answers on its endpoint, and stops it', async () => {
      const sitl = await startSitl()
      expect(alive(sitl.pid)).toBe(true)
      expect(await listening(sitl.endpoint.port)).toBe(true)
      await sitl.stop()
      expect(alive(sitl.pid)).toBe(false)
      expect(await listening(sitl.endpoint.port)).toBe(false)
      expect(await exists(sitl.directory)).toBe(false)
      await sitl.stop()
    }, 90_000)

    it('runs two at once on different ports', async () => {
      const first = await startSitl()
      try {
        const second = await startSitl()
        try {
          expect(second.endpoint.port).not.toBe(first.endpoint.port)
          expect(second.directory).not.toBe(first.directory)
        } finally {
          await second.stop()
        }
      } finally {
        await first.stop()
      }
    }, 180_000)

    it('sets SIM_* parameters, at start and later', async () => {
      await withSitl({ simParams: { SIM_WIND_SPD: 6 } }, async sitl => {
        await sitl.setParam('SIM_WIND_SPD', 9)
        await sitl.setParam('SIM_GPS1_ENABLE', 0)
      })
    }, 90_000)

    it('refuses a parameter the vehicle does not have', async () => {
      await withSitl({}, async sitl => {
        await expect(sitl.setParam('NOT_A_PARAM', 1)).rejects.toThrow('did not confirm NOT_A_PARAM')
      })
    }, 90_000)

    it('runs faster than real time', async () => {
      await withSitl({ speedup: 5 }, async sitl => {
        await sitl.setParam('SIM_WIND_SPD', 1)
      })
    }, 90_000)

    it('flies it (arm in GUIDED, take off, land) and leaves a log in logs/', async () => {
      await withSitl({}, async sitl => {
        await sitl.fly()
        // The log is created at the arm and is still written for a while after the disarm.
        expect(await readdir(join(sitl.directory, 'logs'))).toContain('00000001.BIN')
      })
    }, 330_000)

    it('leaves nothing behind when the test body throws', async () => {
      let started: Sitl | undefined
      await expect(
        withSitl({}, async sitl => {
          started = sitl
          throw new Error('the test failed')
        }),
      ).rejects.toThrow('the test failed')
      expect(started).toBeDefined()
      expect(alive(started?.pid ?? 0)).toBe(false)
      expect(await listening(started?.endpoint.port ?? 0)).toBe(false)
      expect(await exists(started?.directory ?? '')).toBe(false)
    }, 90_000)

    it('refuses an unknown frame before launching anything', async () => {
      await expect(startSitl({ frame: 'zeppelin' })).rejects.toThrow('has no frame')
    })
  },
  { launchOnly: true },
)
