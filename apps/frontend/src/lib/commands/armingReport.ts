// What the user is told of an arm, a disarm or a change of flight mode, from what the backend answered: the vehicle's own answer
// (accepted, refused, unsupported, no answer) with its own words (STATUSTEXT lines: "PreArm: ..."), or the backend's refusal
// before anything was sent (the error code). Nothing here says what the vehicle IS now: that is what its heartbeat says next.
import type { ArmingResult } from '@/generated/app'
import type { CommandContext } from './command'

/** What was asked. */
export type ArmingKind = 'arm' | 'disarm' | 'stop' | 'mode' | 'takeoff' | 'reposition' | 'speed' | 'altitude' | 'home'

/** What the backend refuses a guided command with, in the page's words. */
const GUIDED_REFUSALS: Record<string, string> = {
  NOT_CONNECTED: 'palette.reason.notConnected',
  STATE_UNKNOWN: 'palette.reason.stateUnknown',
  NOT_ARMED: 'palette.reason.notArmed',
  BUSY: 'palette.reason.busyVehicle',
  UNSUPPORTED_VEHICLE: 'guided.reason.unsupported',
  INVALID_VALUE: 'guided.reason.invalid',
  OUT_OF_LIMITS: 'guided.reason.outOfLimits',
  NOT_GUIDED: 'guided.reason.notGuided',
  STALE_POSITION: 'guided.reason.stalePosition',
  NOT_AIRBORNE: 'guided.reason.air',
  HOME_UNKNOWN: 'guided.reason.home',
  GCS_FAILSAFE_OFF: 'guided.reason.failsafeOff',
  FENCE_UNKNOWN: 'guided.reason.fenceUnknown',
  VEHICLE_MOVING: 'guided.reason.moving',
  NOT_HOVERING: 'guided.reason.still',
}

/** The messages for the codes with which the backend refuses before it sends anything, for what was asked. */
const REFUSALS: Record<ArmingKind, Record<string, string>> = {
  arm: {
    NOT_CONNECTED: 'palette.reason.notConnected',
    ARMED: 'palette.reason.alreadyArmed',
    STATE_UNKNOWN: 'palette.reason.stateUnknown',
    BUSY: 'palette.reason.busyVehicle',
  },
  disarm: {
    NOT_CONNECTED: 'palette.reason.notConnected',
    NOT_ARMED: 'palette.reason.notArmed',
    STATE_UNKNOWN: 'palette.reason.stateUnknown',
    BUSY: 'palette.reason.busyVehicle',
  },
  stop: {
    NOT_CONNECTED: 'palette.reason.notConnected',
  },
  mode: {
    NOT_CONNECTED: 'palette.reason.notConnected',
    STATE_UNKNOWN: 'palette.reason.stateUnknown',
    BUSY: 'palette.reason.busyVehicle',
    INVALID_VALUE: 'palette.reason.modeRefused',
    UNSUPPORTED_VEHICLE: 'palette.reason.modesUnsupported',
  },
  reposition: GUIDED_REFUSALS,
  speed: GUIDED_REFUSALS,
  altitude: GUIDED_REFUSALS,
  home: GUIDED_REFUSALS,
  takeoff: {
    NOT_CONNECTED: 'palette.reason.notConnected',
    NOT_ARMED: 'palette.reason.notArmed',
    STATE_UNKNOWN: 'palette.reason.stateUnknown',
    BUSY: 'palette.reason.busyVehicle',
    INVALID_VALUE: 'palette.reason.takeoffAltitude',
    UNSUPPORTED_VEHICLE: 'palette.reason.takeoffUnsupported',
  },
}

/** The most of the vehicle's own lines a toast carries. */
const MAX_LINES = 3

/**
 * The message for a refusal of the backend.
 *
 * @param kind what was asked
 * @param error whatever the call to the backend threw
 * @returns the key of the message when it is one of the backend's refusals, else undefined (a failure to be told as such)
 */
export function armingRefusalKeyOf(kind: ArmingKind, error: unknown): string | undefined {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''

  return REFUSALS[kind][code]
}

/**
 * The vehicle's own lines of an answer, for a toast: the pre-arm reasons first.
 *
 * @param result what the vehicle said
 * @returns at most three lines
 */
export function linesOf(result: ArmingResult): string[] {
  const reasons = result.messages.filter(text => text.startsWith('PreArm'))
  const others = result.messages.filter(text => !text.startsWith('PreArm'))

  return [...reasons, ...others].slice(0, MAX_LINES)
}

/**
 * The vehicle's words to tell with a refusal: those that came with the answer; for an arm that came with none (ArduPilot does not
 * repeat a pre-arm text it has just printed), the reasons it gave lately.
 *
 * @param ctx the context
 * @param kind what was asked
 * @param result what the vehicle said
 * @returns at most three lines
 */
function reasonsToTell(ctx: CommandContext, kind: ArmingKind, result: ArmingResult): string[] {
  const own = linesOf(result)

  return own.length > 0 || kind !== 'arm' ? own : ctx.vehicle.recentReasons().slice(-MAX_LINES)
}

/** How each answer of the vehicle is told: the message that says it, the toast's severity, and whether it stays long. */
const TELLING: Record<ArmingResult['result'], { word: string, severity: 'info' | 'warning' | 'error', long: boolean }> = {
  'accepted': { word: 'accepted', severity: 'info', long: false },
  'refused': { word: 'refused', severity: 'error', long: true },
  'unsupported': { word: 'unsupported', severity: 'warning', long: false },
  'no-answer': { word: 'noAnswer', severity: 'warning', long: true },
}

/**
 * Tells the user what the vehicle said to a command, naming more than the vehicle (the altitude of a takeoff).
 *
 * @param ctx the context
 * @param kind what was asked
 * @param result what the vehicle said
 * @param named what the message names besides the vehicle
 */
export function tellArmingWith(
  ctx: CommandContext,
  kind: ArmingKind,
  result: ArmingResult,
  named: Record<string, unknown>,
): void {
  const vehicle = ctx.vehicle.connection().vehicle?.type ?? ''
  const { word, severity, long } = TELLING[result.result]
  const lines = result.result === 'refused' ? reasonsToTell(ctx, kind, result) : []
  const text = [ctx.say(`arming.${kind}.${word}`, { vehicle, ...named }), ...lines].join(' ')
  ctx.toast({ id: `arming-${kind}`, severity, long, text })
}

/**
 * Tells the user what the vehicle said to a command, with its own words when it refused.
 *
 * @param ctx the context
 * @param kind what was asked
 * @param result what the vehicle said
 */
export function tellArming(ctx: CommandContext, kind: ArmingKind, result: ArmingResult): void {
  tellArmingWith(ctx, kind, result, {})
}

/**
 * Tells the user that the backend would not send the command, and why.
 *
 * @param ctx the context
 * @param kind what was asked
 * @param reasonKey the message that says why
 */
export function tellArmingRefusal(ctx: CommandContext, kind: ArmingKind, reasonKey: string): void {
  ctx.toast({ id: `arming-${kind}`, severity: 'error', text: ctx.say(reasonKey) })
}
