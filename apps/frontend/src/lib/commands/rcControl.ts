// RC control, as a command (the palette): "RC control: turn on or off". It has no key (a key could turn the sticks on by
// accident), and turning it on asks the summary once in a session (the first time), the same one the Fly switch asks. Turning
// it OFF is always possible and never asks. What the pad and the mapping need is looked at by the control itself when it is
// turned on, and it says why in a toast when it will not.
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { namedVehicle } from './arming'
import { VEHICLE_GROUP } from './vehicle'
import { summaryOptions } from '@/lib/rc/summary'

/** Turns the RC control on, or off when it is on. */
export class ToggleRcControl implements Command {
  readonly id = 'vehicle.rcControl'

  readonly labelKey = 'rc.command.label'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'navigation'

  readonly keywordKeys = ['rc.command.keywords']

  // It lets a pad fly the vehicle: never the row that an empty palette has ready because it was run lately.
  readonly dangerous = true

  /**
   * Off is always possible; on needs the setting and a simulator that is connected.
   *
   * @param ctx the context
   * @returns whether, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const block = ctx.rc.state() === 'off' ? ctx.rc.block() : null

    return block === null ? { enabled: true } : { enabled: false, reasonKey: `rc.reason.${block}` }
  }

  /**
   * Turns it off when it is on; turns it on (asking the summary the first time) when it is off.
   *
   * @param ctx the context
   * @returns the focus goes back where it was
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    if (ctx.rc.state() === 'off') {
      await ctx.rc.turnOn(() => ctx.confirm(summaryOptions(ctx.say, namedVehicle(ctx))))
    } else {
      ctx.rc.disable()
    }

    return { focus: 'restore' }
  }
}
