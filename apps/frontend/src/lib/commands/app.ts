// The commands of the top bar: open the command palette, connect to a vehicle (or to the last one again), and disconnect from
// it. The buttons of the top bar run these through the registry, as the palette does, so that what may be pressed (and why not)
// is said in ONE place.
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

  // Choosing it in the palette would close and reopen the palette (a flicker, and the query lost): it is reached by its key.
  readonly listed = false

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
    ctx.dialogs.togglePalette()

    return { focus: 'restore' }
  }
}

/** Opens the help of the keys: every key as the user has it now, by screen. */
export class ShowKeys implements Command {
  readonly id = 'help.keys'

  readonly labelKey = 'keys.help.label'

  readonly groupKey = APP_GROUP

  readonly icon = 'search'

  readonly keywordKeys = ['keys.help.keywords']

  /**
   * The key, as the keymap shows it (none when the user took it off).
   *
   * @returns the hint
   */
  get shortcut(): string {
    return hintOf('help.keys')
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
   * Opens the help, which takes the focus itself and gives it back when it closes.
   *
   * @param ctx the context
   * @returns the focus stays where the help finds it
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.dialogs.showKeys()

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

/**
 * Connects again to the last connection that was made (#27): one key, from anywhere, without the dialog. It may when there is
 * one kept and no link is up or being made; the backend finds again what a serial connection left to it (the port, the rate).
 */
export class ConnectAgain implements Command {
  readonly id = 'connect.last'

  readonly labelKey = 'palette.connectAgain.label'

  readonly buttonLabelKey = 'connect.again'

  readonly groupKey = VEHICLE_GROUP

  readonly icon = 'connect'

  readonly keywordKeys = ['palette.connectAgain.keywords']

  /**
   * It may with a last connection kept, while the link is down (never connected, ended or lost).
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    const { state } = ctx.vehicle.connection()

    if (state !== 'disconnected' && state !== 'lost') {
      return { enabled: false, reasonKey: 'palette.reason.linkUp' }
    }

    return ctx.vehicle.lastConnection() === null
      ? { enabled: false, reasonKey: 'palette.reason.noLastConnection' }
      : { enabled: true }
  }

  /**
   * Connects.
   *
   * @param ctx the context
   * @returns the focus stays where it is
   */
  execute(ctx: CommandContext): CommandOutcome {
    const last = ctx.vehicle.lastConnection()

    if (last) {
      ctx.vehicle.connect(last)
    }

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
