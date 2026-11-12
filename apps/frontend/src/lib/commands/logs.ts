// The commands of the Logs screen: open a log file (a ground station's recording, `.tlog`) from the computer. The button of the
// Flights view and the palette run the same command through the registry.
import type { Availability, Command, CommandContext, CommandOutcome } from './command'

/** The group of the commands about logs. */
export const LOGS_GROUP = 'palette.group.logs'

/** Where the imported log is opened. */
const FLIGHTS_PATH = '/logs/flights'

/** Opens a log file: the user chooses it, it is copied into the library and opened in Flights. */
export class OpenLogFile implements Command {
  readonly id = 'logs.openFile'

  readonly labelKey = 'palette.logs.openFile.label'

  // On the Flights toolbar the words are the button's.
  readonly buttonLabelKey = 'logs.flights.import'

  readonly groupKey = LOGS_GROUP

  readonly icon = 'folder'

  readonly keywordKeys = ['palette.logs.openFile.keywords']

  /**
   * A file can be chosen at any time, except while a log is being read or imported (the backend does one read at a time).
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    return ctx.files.logBusy() ? { enabled: false, reasonKey: 'palette.reason.logBusy' } : { enabled: true }
  }

  /**
   * Goes to the Flights view, where the import is shown, and opens the file dialog.
   *
   * @param ctx the context
   * @returns the focus stays where the screen puts it
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    await ctx.navigate(FLIGHTS_PATH)
    ctx.files.openLog()

    return { focus: 'restore' }
  }
}
