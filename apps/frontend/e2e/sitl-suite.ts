// For test files that need SITL: run when it's there, fail loudly in CI when it isn't, skip elsewhere.
import { describe, it } from 'vitest'
import { type SitlSupply, type VehicleName, findSitlBinary, missingSitlPolicy, sitlSupply } from './sitl'

/** How a suite that needs SITL is set up. */
export interface SitlSuiteOptions {
  /** Which vehicle's simulator (default Copter). */
  vehicle?: VehicleName
  /** A suite that starts SITL itself, which ignores SITL_ENDPOINT. */
  launchOnly?: boolean
}

/** SITL as the body of a suite gets it: one that exists. */
export type AvailableSitl = SitlSupply & { kind: 'endpoint' | 'launch' }

/**
 * How a suite gets its simulator.
 *
 * @param vehicle which vehicle's simulator
 * @param launchOnly true to ignore SITL_ENDPOINT and launch it
 * @returns an endpoint that is running, a binary to launch, or why there is none
 */
function supplyFor(vehicle: VehicleName, launchOnly: boolean): SitlSupply {
  if (!launchOnly) {
    return sitlSupply(vehicle)
  }
  const found = findSitlBinary(vehicle)

  return 'path' in found ? { kind: 'launch', binary: found.path } : { kind: 'missing', reason: found.missing }
}

/**
 * How a suite gets its simulator, from its options.
 *
 * @param options the suite's options
 * @returns an endpoint that is running, a binary to launch, or why there is none
 */
function supplyForOptions(options: SitlSuiteOptions): SitlSupply {
  return supplyFor(options.vehicle ?? 'copter', options.launchOnly ?? false)
}

/**
 * Defines the suite that stands in for one that cannot run: in CI a failing test, elsewhere a skipped one.
 *
 * @param name the suite's name
 * @param reason why there is no SITL
 */
function describeMissing(name: string, reason: string): void {
  if (missingSitlPolicy(process.env) === 'fail') {
    describe(name, () => {
      it('needs SITL', () => {
        throw new Error(`${name}: SITL is required in CI and it is not available: ${reason}`)
      })
    })

    return
  }
  describe.skip(`${name} (skipped: ${reason})`, () => {
    it('needs SITL', () => {})
  })
}

/**
 * Defines a suite that needs SITL.
 *
 * @param name the suite's name
 * @param body defines the tests. Gets how SITL is supplied: launched by the harness, or an endpoint that is already running.
 * @param options `launchOnly` for a suite that starts SITL itself, which ignores SITL_ENDPOINT
 */
export function describeSitl(name: string, body: (supply: AvailableSitl) => void, options: SitlSuiteOptions = {}): void {
  const supply = supplyForOptions(options)
  if (supply.kind === 'missing') {
    describeMissing(name, supply.reason)

    return
  }
  describe(name, () => {
    body(supply)
  })
}
