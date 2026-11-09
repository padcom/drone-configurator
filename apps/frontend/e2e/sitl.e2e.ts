// Against ArduPilot SITL Copter (see the README). With SITL_ENDPOINT set it uses that running simulator;
// otherwise it launches its own, on free ports, and stops it. Without SITL it fails in CI and is skipped elsewhere.
import { afterAll, beforeAll } from 'vitest'
import type { Endpoint } from './endpoint'
import { liveVehicleTests } from './live-vehicle'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** Where to point the page before SITL has started (the tests that need it have not run yet). */
const NOT_STARTED: Endpoint = { transport: 'tcp', host: '127.0.0.1', port: 0 }

describeSitl('the configurator against ArduPilot SITL', supply => {
  let launched: Sitl | undefined

  beforeAll(async () => {
    if (supply.kind === 'launch') {
      launched = await startSitl({ vehicle: 'copter' })
    }
  }, 90_000)

  afterAll(async () => {
    await launched?.stop()
  })

  /**
   * The simulator to connect to: the one already running, or the one this suite launched.
   *
   * @returns where it is
   */
  const endpoint = () => supply.kind === 'endpoint' ? supply.endpoint : (launched?.endpoint ?? NOT_STARTED)

  liveVehicleTests({
    endpoint,
    downloadTimeoutMs: 45_000,
    minParams: 300,
    // Not RTL_ALT: Copter 4.7.2 doesn't have it. Battery capacity is an integer, and harmless on the ground.
    param: 'BATT_CAPACITY',
    paramStep: 100,
  })
})
