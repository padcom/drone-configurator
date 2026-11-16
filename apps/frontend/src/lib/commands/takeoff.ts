// Take off, as a command (the palette). It opens a dialog (the altitude, and a button that goes ahead: not a hold); the dialog's
// button then runs the flow in takeoffFlow.ts: GUIDED, then an arm if the vehicle is disarmed (with its own review and its hold),
// then the takeoff. It is offered only to a vehicle that is connected, whose state is known, that reports a 3D fix and an EKF
// with its position, and that is on the ground. The backend checks again before it sends.
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { connectionBlocker, no, rcBlocker, workBlocker } from './arming'
import { notReady } from '@/lib/fly/takeoff'
import { VEHICLE_GROUP } from './vehicle'

/**
 * Whether the vehicle's state is known (armed or not: both may take off).
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function stateBlocker(ctx: CommandContext): string | null {
  return ctx.vehicle.armed() === undefined ? 'palette.reason.stateUnknown' : null
}

/**
 * Whether the vehicle says it is ready: a 3D fix, the EKF's position, on the ground.
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function readinessBlocker(ctx: CommandContext): string | null {
  const why = notReady(ctx.vehicle.telemetry())

  return why === null ? null : `palette.reason.takeoff.${why}`
}

// What stands in the way of a takeoff, in the order the user should see it.
const BLOCKERS: readonly ((ctx: CommandContext) => string | null)[] = [
  ctx => connectionBlocker(ctx.vehicle),
  stateBlocker,
  ctx => workBlocker(ctx.vehicle),
  rcBlocker,
  readinessBlocker,
]

/** Takes off: asks how high, then goes up (arming first when the vehicle is disarmed). */
export class TakeOff implements Command {
  readonly id = 'vehicle.takeoff'

  readonly labelKey = 'palette.vehicle.takeoff.label'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'navigation'

  // The vehicle leaves the ground: never the row that an empty palette has ready because it was run lately.
  readonly dangerous = true

  readonly keywordKeys = ['palette.vehicle.takeoff.keywords']

  /**
   * May it run now? A connected vehicle whose state is known, with no parameter work under way, that has a 3D fix and the EKF's
   * position (what it does not report is not good), and is on the ground.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const key = BLOCKERS.map(blocker => blocker(ctx)).find(reason => reason !== null)

    return key === undefined || key === null ? { enabled: true } : no(key)
  }

  /**
   * Opens the dialog; nothing is sent until its button is pressed.
   *
   * @param ctx the context
   * @returns what a command leaves behind
   */
  execute(ctx: CommandContext): Promise<CommandOutcome> {
    ctx.dialogs.showTakeoff()

    return Promise.resolve({ focus: 'main' })
  }
}
