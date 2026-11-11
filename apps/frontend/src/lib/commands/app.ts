// The commands of the top bar: open the command palette, connect to a vehicle, and disconnect from it. The buttons of the top bar
// run these through the registry, as the palette does, so that what may be pressed (and why not) is said in ONE place.
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { VEHICLE_GROUP } from './vehicle'
import { hintOf } from '@/lib/app/keymap'

/** The group of the commands about the application itself. */
export const APP_GROUP = 'palette.group.app'

/** Opens the command palette. */
export class ShowPalette implements Command {
  readonly id = 'palette.open'

  readonly labelKey = 'palette.show.label'

  // On the top bar the words are the palette's own placeholder, as they always were.
  readonly buttonLabelKey = 'palette.placeholder'

  readonly groupKey = APP_GROUP

  readonly icon = 'search'

  /**
   * The key, as the keymap shows it ("Ctrl P", or "⌘ P" on a Mac).
   *
   * @returns the hint
   */
  get shortcut(): string {
    return hintOf('palette.open')
  }

  /**
   * It can be asked for everywhere.
   *
   * @returns enabled
   */
  isEnabled(): { enabled: true } {
    return { enabled: true }
  }

  /**
   * Opens the palette, which takes the focus itself and gives it back when it closes.
   *
   * @param ctx the context
   * @returns the focus stays where the palette finds it
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.dialogs.showPalette()

    return { focus: 'restore' }
  }
}

/** Opens the dialog to connect to a vehicle. */
export class ConnectToVehicle implements Command {
  readonly id = 'connect.open'

  readonly labelKey = 'palette.connect.label'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'connect'

  readonly keywordKeys = ['palette.connect.keywords']

  /**
   * It can be asked for at any time: the dialog also reconnects, and says what it needs itself.
   *
   * @returns enabled
   */
  isEnabled(): { enabled: true } {
    return { enabled: true }
  }

  /**
   * Opens the dialog.
   *
   * @param ctx the context
   * @returns the dialog takes the focus and gives it back
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.dialogs.showConnect()

    return { focus: 'restore' }
  }
}

/** Ends the session with the vehicle. */
export class DisconnectFromVehicle implements Command {
  readonly id = 'vehicle.disconnect'

  readonly labelKey = 'connection.disconnect'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'disconnect'

  readonly keywordKeys = ['palette.disconnect.keywords']

  /**
   * It may while the link is up, and while the tries to bring a lost link back go on (Disconnect ends them: the backend stops
   * them with the session).
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const { state } = ctx.vehicle.connection()

    return state === 'connected' || state === 'reconnecting'
      ? { enabled: true }
      : { enabled: false, reasonKey: 'palette.reason.notConnected' }
  }

  /**
   * Ends the session.
   *
   * @param ctx the context
   * @returns the focus stays where it is
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.vehicle.disconnect()

    return { focus: 'restore' }
  }
}
