// What the user is told of an arm, a disarm or a change of flight mode, from what the backend answered: the vehicle's own answer
// (accepted, refused, unsupported, no answer) with its own words (STATUSTEXT lines: "PreArm: ..."), or the backend's refusal
// before anything was sent (the error code). Nothing here says what the vehicle IS now: that is what its heartbeat says next.
import type { ArmingResult } from '@/generated/app'
import type { CommandContext } from './command'

/** What was asked. */
export type ArmingKind = 'arm' | 'disarm' | 'stop' | 'mode'

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

/** How each answer of the vehicle is told: the message that says it, the toast's severity, and whether it stays long. */
const TELLING: Record<ArmingResult['result'], { word: string, severity: 'info' | 'warning' | 'error', long: boolean }> = {
  'accepted': { word: 'accepted', severity: 'info', long: false },
  'refused': { word: 'refused', severity: 'error', long: true },
  'unsupported': { word: 'unsupported', severity: 'warning', long: false },
  'no-answer': { word: 'noAnswer', severity: 'warning', long: true },
}

/**
 * Tells the user what the vehicle said to a command, with its own words when it refused.
 *
 * @param ctx the context
 * @param kind what was asked
 * @param result what the vehicle said
 */
export function tellArming(ctx: CommandContext, kind: ArmingKind, result: ArmingResult): void {
  const vehicle = ctx.vehicle.connection().vehicle?.type ?? ''
  const { word, severity, long } = TELLING[result.result]
  const lines = result.result === 'refused' ? linesOf(result) : []
  const text = [ctx.say(`arming.${kind}.${word}`, { vehicle }), ...lines].join(' ')
  ctx.toast({ id: `arming-${kind}`, severity, long, text })
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
