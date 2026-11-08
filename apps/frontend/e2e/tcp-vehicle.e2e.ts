// Over a real TCP socket, with no SITL: the simulated vehicle behind a port.
import { afterAll, beforeAll, describe } from 'vitest'
import { liveVehicleTests } from './live-vehicle'
import { TcpVehicle } from './tcp-vehicle'

describe('the configurator over TCP', () => {
  let vehicle: TcpVehicle

  beforeAll(async () => {
    vehicle = await TcpVehicle.start()
  })

  afterAll(() => {
    vehicle?.stop()
  })

  liveVehicleTests({
    endpoint: () => ({ transport: 'tcp', host: '127.0.0.1', port: vehicle.port }),
    downloadTimeoutMs: 15_000,
    minParams: 12,
    param: 'RTL_ALT',
    paramStep: 100,
  })
})
