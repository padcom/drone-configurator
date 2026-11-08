// For test files that need SITL: run when it's there, fail loudly in CI when it isn't, skip elsewhere.
import { describe, it } from 'vitest'
import { type SitlSupply, type VehicleName, findSitlBinary, missingSitlPolicy, sitlSupply } from './sitl'

/**
 * Defines a suite that needs SITL.
 *
 * @param name the suite's name
 * @param body defines the tests. Gets how SITL is supplied: launched by the harness, or an endpoint that is already running.
 * @param options `launchOnly` for a suite that starts SITL itself, which ignores SITL_ENDPOINT
 */
export function describeSitl(name: string, body: (supply: SitlSupply & { kind: 'endpoint' | 'launch' }) => void, options: { vehicle?: VehicleName; launchOnly?: boolean } = {}): void {
  const vehicle = options.vehicle ?? 'copter'
  let supply: SitlSupply
  if (options.launchOnly) {
    const found = findSitlBinary(vehicle)
    supply = 'path' in found ? { kind: 'launch', binary: found.path } : { kind: 'missing', reason: found.missing }
  } else {
    supply = sitlSupply(vehicle)
  }

  if (supply.kind === 'missing') {
    const { reason } = supply
    if (missingSitlPolicy(process.env) === 'fail') {
      describe(name, () => {
        it('needs SITL', () => {
          throw new Error(`${name}: SITL is required in CI and it is not available: ${reason}`)
        })
      })
    } else {
      describe.skip(`${name} (skipped: ${reason})`, () => {
        it('needs SITL', () => {})
      })
    }

    return
  }
  describe(name, () => {
    body(supply)
  })
}
