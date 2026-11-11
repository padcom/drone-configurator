// Commands about the vehicle. The reboot restarts the flight controller (MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN, parameter 1 = 1):
// it is not a reset of the parameters. It is refused while armed (ArduPilot refuses too, unless it is sent a force value, which
// this application NEVER sends: the call carries no arguments at all) and while a parameter is being written or downloaded,
// and it asks for a hold before it goes. The backend checks all of it again: this page's view of the vehicle may be late.
import type { Availability, Command, CommandContext, CommandOutcome, RebootResult, VehicleFacts } from './command'
import type { SafetyOptions } from '@/lib/app/safety'

/** The group of the commands that act on the vehicle. */
export const VEHICLE_GROUP = 'palette.group.vehicle'

/** How a reboot ended, with the command's usual outcome. */
export interface RebootOutcome extends CommandOutcome {
  /** What the vehicle said. */
  reboot: RebootResult
}

/**
 * A reason a command may not run, as the palette shows it.
 *
 * @param reasonKey the message that says it
 * @returns the availability
 */
const no = (reasonKey: string): Availability => ({ enabled: false, reasonKey })

/**
 * The reason a vehicle that is not known to be disarmed may not be rebooted.
 *
 * @param armed whether it is armed, if that is known
 * @returns the message of the reason, or null when it is known to be disarmed
 */
function armReason(armed: boolean | undefined): string | null {
  if (armed === undefined) {
    return 'palette.reason.stateUnknown'
  }

  return armed ? 'palette.reason.armed' : null
}

/**
 * What stands in the way of a reboot, the first that applies: no connected vehicle; armed, or not known to be disarmed
 * (that counts as armed); a parameter written or downloaded.
 *
 * @param vehicle the vehicle's facts
 * @returns the message of the reason, or null when nothing does
 */
function blocker(vehicle: VehicleFacts): string | null {
  if (vehicle.connection().state !== 'connected') {
    return 'palette.reason.notConnected'
  }
  const busy = vehicle.busy()

  return armReason(vehicle.armed()) ?? (busy === null ? null : `palette.reason.${busy}`)
}

/** Restarts the flight controller. */
export class RebootFlightController implements Command {
  readonly id = 'vehicle.reboot'

  readonly labelKey = 'palette.vehicle.reboot.label'

  readonly groupKey = VEHICLE_GROUP

  readonly keywordKeys = ['palette.vehicle.reboot.keywords']

  /**
   * May it run now? Not when there is no connected vehicle; not when it is not known whether it is armed (that counts as
   * armed); not when it is; not while the parameters are written or downloaded.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const key = blocker(ctx.vehicle)

    return key === null ? { enabled: true } : no(key)
  }

  /**
   * The question before it runs: a hold, never a single press.
   *
   * @param ctx the context
   * @returns what to ask
   */
  confirmation(ctx: CommandContext): SafetyOptions {
    const info = ctx.vehicle.connection().vehicle
    const named = info === undefined ? '' : ctx.say('topBar.vehicleValue', { ...info })

    return {
      title: ctx.say('palette.vehicle.reboot.title'),
      what: ctx.say('palette.vehicle.reboot.what'),
      vehicle: named,
      level: 'hold',
      tone: 'warn',
      confirmLabel: ctx.say('palette.vehicle.reboot.button'),
    }
  }

  /**
   * Asks the vehicle to reboot, once. Nothing but the request is sent: no force value, no companion action.
   *
   * @param ctx the context
   * @returns what the vehicle said
   */
  async execute(ctx: CommandContext): Promise<RebootOutcome> {
    return { focus: 'restore', reboot: await ctx.vehicle.reboot() }
  }
}
