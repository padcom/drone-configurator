// The commands of the Parameters toolbar: download the list again, save a snapshot, save a parameter file (one command per
// format), load a snapshot or a parameter file, compare the parameters with a file or with the firmware's defaults, and show
// ArduPilot's frame presets. The buttons run these through the registry, as the palette does. (Load metadata is
// `metadata.load`, in metadata.ts.)
import type { Availability, Command, CommandContext, CommandOutcome } from './command'
import { PARAMETERS_GROUP } from './metadata'
import { PARAM_FILE_FORMATS, type ParamFileFormat } from '@/lib/params/paramFile'
import { PRODUCT_SCREENS } from '@/screens/registry'

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

/** Saves the parameters as one of ArduPilot's plain-text parameter files. */
export class SaveParamFile implements Command {
  readonly id: string

  readonly labelKey: string

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'save'

  readonly keywordKeys = ['palette.paramFile.keywords']

  /**
   * The command of one format.
   *
   * @param format the format the file is written in
   */
  constructor(private readonly format: ParamFileFormat) {
    this.id = `paramFile.save.${format}`
    this.labelKey = `palette.paramFile.${format}`
  }

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
    ctx.files.saveParamFile(this.format)

    return { focus: 'restore' }
  }
}

/** Opens a snapshot or a parameter file and loads it for review. */
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

/** Opens a snapshot or a parameter file and compares the parameters with it (#40). */
export class CompareWithFile implements Command {
  readonly id = 'params.compare.file'

  readonly labelKey = 'palette.compare.file.label'

  readonly buttonLabelKey = 'compare.file'

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'upload'

  readonly keywordKeys = ['palette.compare.keywords']

  /**
   * Only when there are parameters to compare.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    return ctx.params.count() > 0 ? { enabled: true } : no('palette.reason.noParameters')
  }

  /**
   * Opens the file dialog (or the file input) and compares with what is chosen.
   *
   * @param ctx the context
   * @returns the focus goes back to what had it
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.files.compareFile()

    return { focus: 'restore' }
  }
}

/**
 * Whether the parameters are free: no download and no write is under way.
 *
 * @param ctx the context
 * @returns whether they are, and if not why
 */
function notWhileBusy(ctx: CommandContext): Availability {
  return ctx.vehicle.busy() === 'downloading' || ctx.params.busy() ? no('palette.reason.busy') : { enabled: true }
}

/** Reads the firmware's defaults from the vehicle and compares the parameters with them (#40). */
export class CompareWithDefaults implements Command {
  readonly id = 'params.compare.defaults'

  readonly labelKey = 'palette.compare.defaults.label'

  readonly buttonLabelKey = 'compare.defaults'

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'download'

  readonly keywordKeys = ['palette.compare.keywords']

  /**
   * Only from a connected vehicle whose parameters are there, and not while a download or a write is under way (the vehicle
   * sends its defaults over the same file transfer).
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    if (ctx.vehicle.connection().state !== 'connected') {
      return no('palette.reason.notConnected')
    }

    return ctx.params.count() === 0 ? no('palette.reason.noParameters') : notWhileBusy(ctx)
  }

  /**
   * Reads the defaults and opens the comparison.
   *
   * @param ctx the context
   * @returns the focus stays where it is
   */
  execute(ctx: CommandContext): CommandOutcome {
    ctx.params.compareDefaults()

    return { focus: 'restore' }
  }
}

/** Where the Parameters screen is, from the list of the screens (the route is not written out twice). */
const PARAMETERS_PATH = PRODUCT_SCREENS.find(screen => screen.id === 'parameters')?.path ?? '/parameters'

/**
 * Shows ArduPilot's frame presets (#41) on the Parameters screen: the list, a search, a preset's contents, and "Review and
 * apply". In the palette (the toolbar has no room for another button) and in Setup › Frame. It writes nothing: a preset's
 * changes go to the review, and only while the vehicle is known to be disarmed.
 */
export class ShowFramePresets implements Command {
  readonly id = 'params.presets'

  readonly labelKey = 'palette.presets.label'

  readonly buttonLabelKey = 'presets.open'

  readonly groupKey = PARAMETERS_GROUP

  readonly icon = 'folder'

  readonly keywordKeys = ['palette.presets.keywords']

  /**
   * Only from a connected vehicle whose parameters are there: the list is for its kind and firmware, and a preset is reviewed
   * against its parameters.
   *
   * @param ctx the context
   * @returns whether it may, and if not why
   */
  isEnabled(ctx: CommandContext): Availability {
    if (ctx.vehicle.connection().state !== 'connected') {
      return no('palette.reason.notConnected')
    }

    return ctx.params.count() === 0 ? no('palette.reason.noParameters') : { enabled: true }
  }

  /**
   * Goes to the Parameters screen and shows the presets.
   *
   * @param ctx the context
   * @returns the focus goes to the presets' search
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    await ctx.navigate(PARAMETERS_PATH)
    ctx.params.framePresets()

    return { focus: 'presets.search' }
  }
}

/**
 * The commands of the Parameters toolbar, in the order they are registered.
 *
 * @returns download, save a snapshot, load a snapshot or file, save a parameter file in each format, compare, and frame presets
 */
export function parameterCommands(): Command[] {
  const saves = PARAM_FILE_FORMATS.map(format => new SaveParamFile(format))

  const compares = [new CompareWithFile(), new CompareWithDefaults()]

  return [new DownloadParameters(), new SaveSnapshot(), new LoadSnapshot(), ...saves, ...compares, new ShowFramePresets()]
}
