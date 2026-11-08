// Against a running ArduPilot SITL Copter (see the README). Skipped unless SITL_ENDPOINT says where
// it is, for example SITL_ENDPOINT=tcp:127.0.0.1:5760 pnpm e2e
import { describe } from 'vitest'
import { parseEndpoint } from './endpoint'
import { liveVehicleTests } from './live-vehicle'

const endpoint = process.env.SITL_ENDPOINT

describe.skipIf(!endpoint)('the configurator against ArduPilot SITL', () => {
  liveVehicleTests({
    endpoint: () => parseEndpoint(endpoint ?? ''),
    downloadTimeoutMs: 45_000,
    minParams: 300,
    // Not RTL_ALT: Copter 4.7.2 doesn't have it. Battery capacity is an integer, and harmless on the ground.
    param: 'BATT_CAPACITY',
    paramStep: 100,
  })
})
