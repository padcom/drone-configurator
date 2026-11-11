// "Load parameter metadata…": opens a parameter metadata file (ArduPilot's apm.pdef.json, or the application's own format) from
// anywhere. It is the flow of the Load metadata button of the Parameters screen (a native dialog in Pico Desktop, a file input in
// a browser, a toast with what was found), so it is what the button runs too. It needs no vehicle: the descriptions are kept
// and used for the parameters of any vehicle that is connected, now or later.
import type { Command, CommandContext, CommandOutcome } from './command'

/** The group of the commands about the parameters. */
export const PARAMETERS_GROUP = 'palette.group.parameters'

/** The command that opens a parameter metadata file. */
export class LoadMetadata implements Command {
  readonly id = 'metadata.load'

  readonly labelKey = 'palette.metadata.load.label'

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'folder'

  readonly keywordKeys = ['palette.metadata.load.keywords']

  /**
   * It can always be asked for: a file can be chosen with or without a vehicle.
   *
   * @returns enabled
   */
  isEnabled(): { enabled: true } {
    return { enabled: true }
  }

  /**
   * Opens the file dialog (or the file input) and loads what is chosen; the dialog and the toast are the flow's own.
   *
   * @param ctx the context
   * @returns the focus goes back to what had it: the dialog is the user's next step, not a screen
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.files.loadMetadata()

    return { focus: 'restore' }
  }
}
