// Against ArduPilot SITL Copter (see the README). With SITL_ENDPOINT set it uses that running simulator;
// otherwise it launches its own, on free ports, and stops it. Without SITL it fails in CI and is skipped elsewhere.
import { join } from 'node:path'
import { afterAll, beforeAll } from 'vitest'
import type { Endpoint } from './endpoint'
import { liveVehicleTests } from './live-vehicle'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** Where to point the page before SITL has started (the tests that need it have not run yet). */
const NOT_STARTED: Endpoint = { transport: 'tcp', host: '127.0.0.1', port: 0 }

/**
 * The defaults SITL Copter starts with: ArduPilot's own Tools/autotest/default_params/copter.parm (NAME VALUE, aligned with
 * spaces and tabs), which the SITL build copies.
 *
 * @returns its path, or null without SITL_DIR
 */
const copterDefaults = () => (process.env.SITL_DIR ? join(process.env.SITL_DIR, 'default_params', 'copter.parm') : null)

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
    // Some of SITL's parameters count or learn while it stands (STAT_RUNTIME).
    stableParams: false,
    realParamFile: copterDefaults,
  })
})
