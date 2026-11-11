// What the user is told of a reboot, from what the backend answered: the vehicle's own answer (accepted, refused, unsupported, no
// answer), or the backend's refusal before anything was sent (the error code). The words are messages of the interface.
import type { CommandContext, RebootResult } from './command'

/** The messages for the codes with which the backend refuses before it sends anything. */
const REFUSALS: Record<string, string> = {
  NOT_CONNECTED: 'palette.reason.notConnected',
  ARMED: 'palette.reason.armed',
  STATE_UNKNOWN: 'palette.reason.stateUnknown',
  BUSY: 'palette.reason.busy',
}

/**
 * The message for a refusal of the backend.
 *
 * @param error whatever the call to the backend threw
 * @returns the key of the message when it is one of the backend's refusals, else undefined (a failure to be told as such)
 */
export function refusalKeyOf(error: unknown): string | undefined {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''

  return REFUSALS[code]
}

/**
 * Names the vehicle for the user: its type, as the top bar says it.
 *
 * @param ctx the context
 * @returns the type, or an empty string when none is known
 */
export function vehicleName(ctx: CommandContext): string {
  return ctx.vehicle.connection().vehicle?.type ?? ''
}

/**
 * Tells the user what the vehicle said to the reboot. In progress counts as accepted (the backend says so): the vehicle is at it.
 * A vehicle that said nothing may still reboot: the toast says so, and that nothing was sent again.
 *
 * @param ctx the context
 * @param result what the vehicle said
 */
export function tellResult(ctx: CommandContext, result: RebootResult): void {
  const vehicle = { vehicle: vehicleName(ctx) }
  switch (result.result) {
    case 'accepted':
      ctx.toast({ id: 'reboot', severity: 'success', text: ctx.say('palette.vehicle.reboot.accepted', vehicle) })
      break
    case 'refused':
      ctx.toast({ id: 'reboot', severity: 'error', text: ctx.say('palette.vehicle.reboot.refused', vehicle) })
      break
    case 'unsupported':
      ctx.toast({ id: 'reboot', severity: 'warning', text: ctx.say('palette.vehicle.reboot.unsupported', vehicle) })
      break
    default:
      ctx.toast({ id: 'reboot', severity: 'warning', long: true, text: ctx.say('palette.vehicle.reboot.noAnswer', vehicle) })
  }
}

/**
 * Tells the user that the backend would not send the reboot, and why.
 *
 * @param ctx the context
 * @param reasonKey the message that says why
 */
export function tellRefusal(ctx: CommandContext, reasonKey: string): void {
  ctx.toast({ id: 'reboot', severity: 'error', text: ctx.say(reasonKey) })
}
