// Change altitude, as a command (the palette, and a button beside the map). It opens a dialog (the altitude, and a plain
// button that goes
// ahead: it holds the vehicle where it is, so it is one deliberate press, not a hold); the dialog's button then runs the flow in
// changeAltitudeFlow.ts. It is offered to a connected, armed vehicle whose state is known, in the air, with a position, the
// complete list of
// its parameters, not coming home or landing, and near a stop (it cancels what the vehicle flies to).
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { connectionBlocker, no, workBlocker } from './arming'
import { armedBlocker } from './goHere'
import { VEHICLE_GROUP } from './vehicle'
import { changeAltitudeBlock } from '@/lib/fly/guided'

/**
 * What the rules of guided control say is missing.
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function guidedBlocker(ctx: CommandContext): string | null {
  const why = changeAltitudeBlock({ telemetry: ctx.vehicle.telemetry(), listComplete: ctx.params.listComplete() })

  return why === null ? null : `guided.reason.${why}`
}

// What stands in the way of a change of altitude, in the order the user should see it.
const BLOCKERS: readonly ((ctx: CommandContext) => string | null)[] = [
  ctx => connectionBlocker(ctx.vehicle),
  armedBlocker,
  ctx => workBlocker(ctx.vehicle),
  guidedBlocker,
]

/** Goes to another altitude where the vehicle is. */
export class ChangeAltitude implements Command {
  readonly id = 'vehicle.changeAltitude'

  readonly labelKey = 'guided.command.altitudeLabel'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'navigation'

  // The vehicle moves: never the row that an empty palette has ready because it was run lately.
  readonly dangerous = true

  readonly keywordKeys = ['guided.command.altitudeKeywords']

  /**
   * May it run now?
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
    ctx.dialogs.showChangeAltitude()

    return Promise.resolve({ focus: 'main' })
  }
}
