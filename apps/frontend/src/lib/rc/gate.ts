// When RC control may be turned on (plan `drone-configurator-rc-control.md`, section 6, rules 1 and 2): the setting is on, the
// link goes to a simulator (read from what the connection was asked for, never assumed), a pad is live, the mapping has been
// through the calibration wizard and passes its checks, and the vehicle's channels agree with it. The answer is the first thing
// that is not so; the page says it in words, and nothing turns the control on while it is not null.
import { problemsOf } from './profile'
import type { Profile } from './types'
import type { VehicleProblem } from './vehicle'
import type { ConnectRequest } from '@/generated/app'

/** The addresses that are this computer: a vehicle on one of them is a simulator the person runs. */
export const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '::1', '[::1]']

/**
 * Whether a TCP or UDP connection goes to this computer.
 *
 * @param request what the connection was asked for
 * @returns true when its transport is TCP or UDP and its host is a loopback address
 */
function isLoopback(request: ConnectRequest): boolean {
  const network = request.transport === 'tcp' || request.transport === 'udp'

  return network && LOOPBACK_HOSTS.includes((request.host ?? '').toLowerCase())
}

/**
 * Whether a connection goes to a simulator: the built-in one, or TCP or UDP to this computer. Anything else (a serial port, a
 * network address) is a real vehicle, as far as this is concerned.
 *
 * @param request what the connection was asked for
 * @returns true for a simulator
 */
export function isSimulatorLink(request: ConnectRequest | null): boolean {
  return request !== null && (request.transport === 'simulator' || isLoopback(request))
}

/** Why control may not be turned on: `off` (the setting), `link` (not a simulator), `pad`, `mapping` or `vehicle`. */
export type ControlBlock = 'off' | 'link' | 'pad' | 'mapping' | 'vehicle'

/** What decides it. */
export interface ControlInput {
  /** The setting "Allow RC control". */
  allowed: boolean
  /** What the connection was asked for. */
  request: ConnectRequest | null
  /** Whether a pad is being read. */
  padLive: boolean
  /** The mapping of that pad, or null when it has none. */
  profile: Profile | null
  /** What the vehicle and the mapping say together. */
  vehicle: readonly VehicleProblem[]
}

/**
 * Whether a mapping is missing or has a problem (a mapping the wizard has not been through has one).
 *
 * @param profile the mapping, or null
 * @returns true when it may not drive a vehicle
 */
function mappingWrong(profile: Profile | null): boolean {
  return profile === null || problemsOf(profile).length > 0
}

/**
 * Whether control may be turned on.
 *
 * @param input what decides it
 * @returns why not (the first of the checks that is not so, in this order), or null when it may
 */
export function controlBlock(input: ControlInput): ControlBlock | null {
  const checks: [ControlBlock, boolean][] = [
    ['off', !input.allowed],
    ['link', !isSimulatorLink(input.request)],
    ['pad', !input.padLive],
    ['mapping', mappingWrong(input.profile)],
    ['vehicle', input.vehicle.some(problem => problem.blocks)],
  ]

  return checks.find(([, wrong]) => wrong)?.[0] ?? null
}
