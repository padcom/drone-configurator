// Over a real TCP socket, with no SITL: the simulated vehicle behind a port
// (apps/backend/e2e/tcp-vehicle.pi).
import { type ChildProcessByStdio, execFile, spawn } from 'node:child_process'
import type { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe } from 'vitest'
import { announcedPort } from './announced-port'
import { liveVehicleTests } from './live-vehicle'

const source = fileURLToPath(new URL('../../backend/e2e/tcp-vehicle.pi', import.meta.url))
const binary = fileURLToPath(new URL('../../../.pico-desktop/e2e/tcp-vehicle', import.meta.url))

describe('the configurator over TCP', () => {
  let vehicle: ChildProcessByStdio<null, Readable, null>
  let port = 0

  beforeAll(async () => {
    await promisify(execFile)('pico', ['build', source, '-o', binary])
    vehicle = spawn(binary, [], { stdio: ['ignore', 'pipe', 'inherit'] })
    port = await announcedPort(vehicle)
  })

  afterAll(() => {
    vehicle?.kill()
  })

  liveVehicleTests({
    endpoint: () => ({ transport: 'tcp', host: '127.0.0.1', port }),
    downloadTimeoutMs: 15_000,
    minParams: 12,
    param: 'RTL_ALT',
    paramStep: 100,
  })
})
