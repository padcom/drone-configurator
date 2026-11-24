// A parameter file from an older firmware imports into ArduPilot SITL Copter 4.7 (#202): RTL_ALT of a 4.6 file (centimetres)
// is offered as RTL_ALT_M (metres), converted, and written with a read-back. Copter has RTL_ALT_M from 4.7 (the CI's 4.7.3 and a
// later local build alike), so the checks need no other name.
import { afterAll, beforeAll } from 'vitest'
import type { Endpoint } from './endpoint'
import { renamedParamsTests } from './renamed-params'
import { type Sitl, startSitl } from './sitl'
import { describeSitl } from './sitl-suite'

/** Where to point the page before SITL has started (the tests that need it have not run yet). */
const NOT_STARTED: Endpoint = { transport: 'tcp', host: '127.0.0.1', port: 0 }

describeSitl('a parameter file of an older firmware, into ArduPilot SITL', supply => {
  let launched: Sitl | undefined

  beforeAll(async () => {
    if (supply.kind === 'launch') {
      launched = await startSitl({ vehicle: 'copter' })
    }
  }, 90_000)

  afterAll(async () => {
    await launched?.stop()
  })

  renamedParamsTests({
    endpoint: () => (supply.kind === 'endpoint' ? supply.endpoint : (launched?.endpoint ?? NOT_STARTED)),
    downloadTimeoutMs: 45_000,
  })
})
