// Commands of the Plan page: add a waypoint, copy, delete and move the selected item, Undo and Redo. They work on the plan that
// is shown (offline: nothing here is sent to a vehicle), so they are offered on the Plan page only. Each is an edit of the
// history (lib/plan/edit.ts): Undo takes back whatever any of them did, a deletion included, so none of them asks.
import type { Availability, Command, CommandContext, CommandOutcome } from './command'

/** The group of the commands that edit the plan. */
export const PLAN_GROUP = 'plan.group'

/** The route of the Plan page. */
const PLAN_PATH = '/plan'

/**
 * A reason a command may not run, as the palette shows it.
 *
 * @param reasonKey the message that says it
 * @returns the availability
 */
const no = (reasonKey: string): Availability => ({ enabled: false, reasonKey })

/**
 * What stands in the way of every command here: the Plan page is not the one that is shown.
 *
 * @param ctx the context
 * @returns the reason, or null
 */
function notOnThePage(ctx: CommandContext): string | null {
  return ctx.currentPath().startsWith(PLAN_PATH) ? null : 'plan.reason.notOnPlan'
}

/** What the commands that edit the plan have in common. */
abstract class PlanCommand implements Command {
  abstract readonly id: string

  abstract readonly labelKey: string

  readonly groupKey = PLAN_GROUP

  readonly icon = 'route'

  /**
   * What else stands in the way (the plan has no such item, nothing to undo), after the page. Nothing, unless a command says.
   *
   * @param ctx the context
   * @returns the reason, or null
   */
  protected blocker?(ctx: CommandContext): string | null

  /**
   * Does it to the plan.
   *
   * @param ctx the context
   */
  protected abstract run(ctx: CommandContext): void

  isEnabled(ctx: CommandContext): Availability {
    const why = notOnThePage(ctx) ?? this.blocker?.(ctx)

    return why ? no(why) : { enabled: true }
  }

  execute(ctx: CommandContext): CommandOutcome {
    this.run(ctx)

    return { focus: 'main' }
  }
}

/** Adds a waypoint after the selected item (at the end when none is selected). */
export class AddWaypoint extends PlanCommand {
  readonly id = 'plan.addWaypoint'

  readonly labelKey = 'plan.command.addWaypoint.label'

  readonly keywordKeys = ['plan.command.addWaypoint.keywords']

  protected blocker(ctx: CommandContext): string | null {
    return ctx.plan.full() ? 'plan.reason.planFull' : null
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.add(16)
  }
}

/** Turns on (or off) the mode in which a click on the map adds a waypoint after the selected item. */
export class AddOnMap extends PlanCommand {
  readonly id = 'plan.addOnMap'

  readonly labelKey = 'plan.command.addOnMap.label'

  readonly keywordKeys = ['plan.command.addOnMap.keywords']

  protected blocker(ctx: CommandContext): string | null {
    // (leaving the mode is always possible)
    return ctx.plan.full() && !ctx.plan.adding() ? 'plan.reason.planFull' : null
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.setAdding(!ctx.plan.adding())
  }
}

/** Adds a copy of the selected item after it. */
export class DuplicateItem extends PlanCommand {
  readonly id = 'plan.duplicate'

  readonly labelKey = 'plan.command.duplicate.label'

  readonly keywordKeys = ['plan.command.duplicate.keywords']

  protected blocker(ctx: CommandContext): string | null {
    if (ctx.plan.selected() === null) {
      return 'plan.reason.noItemSelected'
    }

    return ctx.plan.full() ? 'plan.reason.planFull' : null
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.duplicate()
  }
}

/** Takes the selected item out of the plan (Undo gives it back, so it does not ask). */
export class DeleteItem extends PlanCommand {
  readonly id = 'plan.delete'

  readonly labelKey = 'plan.command.delete.label'

  readonly keywordKeys = ['plan.command.delete.keywords']

  protected blocker(ctx: CommandContext): string | null {
    return ctx.plan.selected() === null ? 'plan.reason.noItemSelected' : null
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.remove()
  }
}

/** Moves the selected item one place up the list. */
export class MoveItemUp extends PlanCommand {
  readonly id = 'plan.moveUp'

  readonly labelKey = 'plan.command.moveUp.label'

  readonly keywordKeys = ['plan.command.moveUp.keywords']

  protected blocker(ctx: CommandContext): string | null {
    return ctx.plan.canMove(-1) ? null : 'plan.reason.cannotMove'
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.move(-1)
  }
}

/** Moves the selected item one place down the list. */
export class MoveItemDown extends PlanCommand {
  readonly id = 'plan.moveDown'

  readonly labelKey = 'plan.command.moveDown.label'

  readonly keywordKeys = ['plan.command.moveDown.keywords']

  protected blocker(ctx: CommandContext): string | null {
    return ctx.plan.canMove(1) ? null : 'plan.reason.cannotMove'
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.move(1)
  }
}

/** Takes back the last change to the plan. */
export class UndoPlan extends PlanCommand {
  readonly id = 'plan.undo'

  readonly labelKey = 'plan.command.undo.label'

  readonly keywordKeys = ['plan.command.undo.keywords']

  protected blocker(ctx: CommandContext): string | null {
    return ctx.plan.canUndo() ? null : 'plan.reason.nothingToUndo'
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.undo()
  }
}

/** Does again what Undo took back. */
export class RedoPlan extends PlanCommand {
  readonly id = 'plan.redo'

  readonly labelKey = 'plan.command.redo.label'

  readonly keywordKeys = ['plan.command.redo.keywords']

  protected blocker(ctx: CommandContext): string | null {
    return ctx.plan.canRedo() ? null : 'plan.reason.nothingToRedo'
  }

  protected run(ctx: CommandContext): void {
    ctx.plan.redo()
  }
}
