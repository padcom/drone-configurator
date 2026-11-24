// A parameter file from an older firmware (#202), over a real TCP socket with no SITL: the simulated vehicle as a Copter of 4.7
// (RTL_ALT_M, WP_SPD), which never arms and does not say its version (its names decide). The same checks run against ArduPilot
// SITL in sitl-param-renamed.e2e.ts.
import { afterAll, beforeAll, describe } from 'vitest'
import { renamedParamsTests } from './renamed-params'
import { TcpVehicle } from './tcp-vehicle'

describe('a parameter file of an older firmware, over TCP', () => {
  let vehicle: TcpVehicle

  beforeAll(async () => {
    vehicle = await TcpVehicle.startRenamed()
  })

  afterAll(() => {
    vehicle?.stop()
  })

  renamedParamsTests({
    endpoint: () => ({ transport: 'tcp', host: '127.0.0.1', port: vehicle.port }),
    downloadTimeoutMs: 15_000,
  })
})
