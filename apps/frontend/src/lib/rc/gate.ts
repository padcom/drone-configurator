// When RC control may be turned on (plan `drone-configurator-rc-control.md`, section 6, rules 1 and 2): the setting is on, the
// link goes to a simulator (read from what the connection was asked for, never assumed), a pad is live, the mapping has been
// confirmed by the person and passes its checks, and the vehicle's channels agree with it. The answer is the first thing
// that is not so; the page says it in words, and nothing turns the control on while it is not null.
import { startAllowed } from './modes'
import { problemsOf } from './profile'
import type { Sticks } from './rest'
import type { PadLayout, Profile } from './types'
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

  // (no host: the connect dialog's blank field, "the default": the backend connects to, or listens on, 127.0.0.1)
  return network && (request.host === undefined || LOOPBACK_HOSTS.includes(request.host.toLowerCase()))
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

/**
 * Why control may not be turned on: `off` (the setting), `link` (not a simulator), `pad`, `mapping` (a problem of the mapping,
 * among them that it was not confirmed), `reading` (a control channel's pad channel is missing or is a button), `vehicle` or
 * `mode` (a centred throttle only starts in a mode that reads the throttle as a climb rate).
 */
export type ControlBlock = 'off' | 'link' | 'pad' | 'mapping' | 'reading' | 'vehicle' | 'mode'

/** What decides it. */
export interface ControlInput {
  /** The setting "Allow RC control". */
  allowed: boolean
  /** What the connection was asked for. */
  request: ConnectRequest | null
  /**
   * Whether a request that is not known (null) is left to the backend: the page does not know what a connection that is up was
   * asked for (the page was reloaded over a live backend, or it came back after being lost), and the backend's own check
   * (`NOT_SIMULATOR`) is the hard gate. A request that is known and is not a simulator is always `link`.
   */
  letBackendDecide?: boolean
  /** Whether a pad is being read. */
  padLive: boolean
  /** The mapping of that pad, or null when it has none. */
  profile: Profile | null
  /** What each channel of the pad is now (null while it is not read). */
  layout: PadLayout | null
  /** The channels of the vehicle's four sticks, or null when the vehicle did not say. */
  sticks: Sticks | null
  /** The vehicle's flight mode (its name), or undefined when it is not known. */
  mode?: string
  /** What the vehicle and the mapping say together. */
  vehicle: readonly VehicleProblem[]
}

/**
 * Whether a mapping is missing or has a problem (a mapping that was not confirmed for this pad has one).
 *
 * @param input what decides it
 * @returns true when it may not drive a vehicle
 */
function mappingWrong(input: ControlInput): boolean {
  return input.profile === null || problemsOf(input.profile, input.layout).length > 0
}

/**
 * Whether one of the four control channels has no pad channel that is an axis.
 *
 * @param profile the mapping
 * @param layout what each channel of the pad is
 * @param sticks the channels of the vehicle's four sticks
 * @returns true when one does not (no row, a pad channel the pad has not, or a button)
 */
export function sticksUnread(profile: Profile, layout: PadLayout, sticks: Sticks): boolean {
  return Object.values(sticks).some(channel => {
    const row = profile.rows.find(candidate => candidate.channel === channel)

    return row === undefined || layout[row.source - 1] !== 'axis'
  })
}

/**
 * Whether one of the four control channels has no pad channel that is an axis (a pad channel the pad has not, or a button). A
 * stick must be proportional, and a reading of it must be there.
 *
 * @param input what decides it
 * @returns true when one does not
 */
function readingWrong(input: ControlInput): boolean {
  const { profile, layout, sticks } = input

  return profile !== null && layout !== null && sticks !== null && sticksUnread(profile, layout, sticks)
}

/**
 * Whether the mode does not let this control start: a centred throttle starts only in a mode that reads it as a climb rate.
 *
 * @param input what decides it
 * @returns true when it does not
 */
function modeWrong(input: ControlInput): boolean {
  return input.profile !== null && !startAllowed(input.profile.throttleStyle === 'centred', input.mode)
}

/**
 * Whether the link is not one control may go over: a request that is a simulator passes, and so does one that is not known when
 * the backend is left to decide.
 *
 * @param input what decides it
 * @returns true when it is not
 */
function linkWrong(input: ControlInput): boolean {
  const left = input.letBackendDecide === true && input.request === null

  return !isSimulatorLink(input.request) && !left
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
    ['link', linkWrong(input)],
    ['pad', !input.padLive],
    ['mapping', mappingWrong(input)],
    ['reading', readingWrong(input)],
    ['vehicle', input.vehicle.some(problem => problem.blocks)],
    ['mode', modeWrong(input)],
  ]

  return checks.find(([, wrong]) => wrong)?.[0] ?? null
}
