// The commands of the Parameters toolbar: download the list again, save a snapshot, load a snapshot. The buttons run these
// through the registry, as the palette does. (Load metadata is `metadata.load`, in metadata.ts.)
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { PARAMETERS_GROUP } from './metadata'

/**
 * A reason a command may not run.
 *
 * @param reasonKey the message that says it
 * @returns the availability
 */
const no = (reasonKey: string): Availability => ({ enabled: false, reasonKey })

/** Downloads the parameters from the vehicle again. */
export class DownloadParameters implements Command {
  readonly id = 'params.download'

  readonly labelKey = 'palette.params.download.label'

  // On the toolbar the word is the button's, as it always was.
  readonly buttonLabelKey = 'params.download'

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'download'

  readonly keywordKeys = ['palette.params.download.keywords']

  /**
   * Only from a connected vehicle, and not while another download or a write is under way (a download in the middle of a write
   * would put half-written values in the initial ones).
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    if (ctx.vehicle.connection().state !== 'connected') {
      return no('palette.reason.notConnected')
    }
    if (ctx.vehicle.busy() === 'downloading') {
      return no('palette.reason.downloading')
    }

    return ctx.params.busy() ? no('palette.reason.busy') : { enabled: true }
  }

  /**
   * Downloads the list.
   *
   * @param ctx the context
   * @returns the focus stays where it is
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.params.download()

    return { focus: 'restore' }
  }
}

/** Saves the parameters as a snapshot file. */
export class SaveSnapshot implements Command {
  readonly id = 'snapshot.save'

  readonly labelKey = 'palette.snapshot.save.label'

  readonly buttonLabelKey = 'snapshot.save'

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'save'

  readonly keywordKeys = ['palette.snapshot.save.keywords']

  /**
   * Only when there are parameters to save.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    return ctx.params.count() > 0 ? { enabled: true } : no('palette.reason.noParameters')
  }

  /**
   * Saves the file: the host's dialog in Pico Desktop, a download in a browser.
   *
   * @param ctx the context
   * @returns the focus stays where it is
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.files.saveSnapshot()

    return { focus: 'restore' }
  }
}

/** Opens a snapshot file and loads it. */
export class LoadSnapshot implements Command {
  readonly id = 'snapshot.load'

  readonly labelKey = 'palette.snapshot.load.label'

  readonly buttonLabelKey = 'snapshot.load'

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'upload'

  readonly keywordKeys = ['palette.snapshot.load.keywords']

  /**
   * A file can be chosen at any time: what the snapshot holds is checked, and told, when it is loaded.
   *
   * @returns enabled
   */
  isEnabled(): { enabled: true } {
    return { enabled: true }
  }

  /**
   * Opens the file dialog (or the file input) and loads what is chosen.
   *
   * @param ctx the context
   * @returns the focus goes back to what had it
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.files.loadSnapshot()

    return { focus: 'restore' }
  }
}
