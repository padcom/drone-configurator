// The Command pattern for what the user can ask the application to do: go to a screen, reboot the flight controller. A command
// is a small object that knows its own label, whether it may run now (and if not, why), what to ask before it runs, and what it
// does. Nothing here draws anything or knows Vue: the palette (and later the top bar, the F-keys, the menus) only list commands
// and call `CommandRegistry.invoke`, which is the one way a command runs.
import type { Connection } from '@/generated/app'
import type { IconName } from '@/lib/ui/icons'
import type { SearchIndex } from '@/lib/params/paramSearch'
import type { SafetyOptions } from '@/lib/app/safety'
import type { ToastInput } from '@/composables/toasts'

/** Whether a command may run now: it may, or it may not, for a reason that is a message of the interface. */
export type Availability
  = | { enabled: true }
    | { enabled: false, reasonKey: string, reasonParams?: Record<string, unknown> }

/** Where the focus can be sent after a command: a place of the application, by name (the command does not touch the page). */
export type FocusTarget = 'restore' | 'main' | 'params.search' | 'params.value'

/** What a command leaves behind for the caller: where the focus goes. */
export interface CommandOutcome {
  /**
   * `restore`: back to what had it before the palette opened. `main`: into the screen (the old element may be hidden now; a click
   * on the rail keeps the focus on the rail). `params.search`: the Parameters screen's search box, wherever the command was run
   * from (the same place Ctrl+/ goes to). `params.value`: the value editor of the parameter named in `focusId` (its row when it
   * has no editor).
   */
  focus?: FocusTarget
  /** What `focus` needs to know: the parameter, for `params.value`. */
  focusId?: string
}

/** What the vehicle says to a reboot. */
export interface RebootResult {
  /** `accepted`: it will reboot. `refused`: it did not. `unsupported`: it does not know the command. `no-answer`: silence. */
  result: 'accepted' | 'refused' | 'unsupported' | 'no-answer'
  /** Why, in the vehicle's or the backend's words, when there is more to say. */
  detail?: string
}

/** What a parameter operation in progress is, which a reboot must not cut. */
export type ParameterWork = 'writing' | 'downloading'

/** The vehicle, as the commands see it. */
export interface VehicleFacts {
  /** The connection now: its state, the vehicle's identity. */
  connection(): Connection
  /** Whether the vehicle is armed; undefined when that is not known (no heartbeat for more than 3 s): unknown counts as armed. */
  armed(): boolean | undefined
  /** The parameter operation under way, if any. */
  busy(): ParameterWork | null
  /** Asks the backend to reboot the flight controller. */
  reboot(): Promise<RebootResult>
  /** Ends the session with the vehicle (and the tries to bring a lost link back). */
  disconnect(): void
}

/** The vehicle's parameters, as the toolbar's commands see them. */
export interface ParamsFacts {
  /** How many parameters the list has. */
  count(): number
  /** Whether a write (or another job) holds the parameters: a download in the middle of it would mix its values up. */
  busy(): boolean
  /** Downloads the list again. */
  download(): void
}

/** The parts of the page that open on a command: the dialogs that are not a screen. */
export interface DialogFacts {
  /** Opens the dialog to connect to a vehicle. */
  showConnect(): void
  /** Opens the command palette, or closes it when it is open; it does not open over another dialog. */
  togglePalette(): void
}

/** The vehicle's parameters, as the commands that go to one see them. */
export interface ParameterFacts {
  /** What is searched of the parameters: made once for the list and the metadata (the Parameters screen's own index). */
  searchIndex(): SearchIndex
  /** The names the user has starred. */
  favourites(): ReadonlySet<string>
  /** A parameter's short description from the metadata, or an empty string. */
  describe(id: string): string
  /** Makes the Parameters screen show a parameter: its search cleared, the parameter selected. */
  reveal(id: string): void
}

/** The files the application opens, as the commands that ask for one see them. */
export interface FileFacts {
  /**
   * Opens a parameter metadata file and loads it: the same flow as the Load metadata button (the host's dialog in Pico Desktop, a
   * file input in a browser; the result is told in a toast).
   */
  loadMetadata(): void
  /** Saves the parameters as a snapshot file (the host's dialog in Pico Desktop, a download in a browser). */
  saveSnapshot(): void
  /** Opens a snapshot file and loads it, the same way as `loadMetadata` does for metadata. */
  loadSnapshot(): void
  /** Lets the user choose a log file (a ground station's recording), imports it and opens it in Flights. */
  openLog(): void
  /** Whether a log is being read or imported (the backend does one read at a time). */
  logBusy(): boolean
}

/** What is known of how the commands have been used: the palette lists the ones run last first. */
export interface UsageFacts {
  /** The ids of the commands run lately, the one run last first. */
  recent(): readonly string[]
}

/** Everything a command may touch: the commands get nothing else, so a test can make a context of a few lines. */
export interface CommandContext {
  /** Goes to a route. */
  navigate(path: string): Promise<void>
  /** The route that is shown now. */
  currentPath(): string
  /** The parameters. */
  parameters: ParameterFacts
  /** The vehicle. */
  vehicle: VehicleFacts
  /** The vehicle's parameters. */
  params: ParamsFacts
  /** The dialogs that open on a command. */
  dialogs: DialogFacts
  /** How the commands have been used. */
  usage: UsageFacts
  /** Files: what a command may ask to be opened. */
  files: FileFacts
  /** Asks the user to confirm (the one route for dangerous actions); false for "no" and for Escape. */
  confirm(options: SafetyOptions): Promise<boolean>
  /** Tells the user something short. */
  toast(input: ToastInput): void
  /** A message of the interface in the language of the page. */
  say(key: string, named?: Record<string, unknown>): string
  /** The language of the page (its code): what labels are sorted by. */
  language(): string
  /** The same message in English, so that a command can be found by its English name in every language. */
  sayEnglish(key: string, named?: Record<string, unknown>): string
}

/** One thing the user can ask for. */
export interface Command {
  /** Unique and stable: `go.parameters`, `vehicle.reboot`. */
  readonly id: string
  /** The message that names it: the palette translates it, there is no text here. */
  readonly labelKey: string
  /** The message for the words on a button, when shorter than the palette's ("Flight data" for "Switch to Flight data"). */
  readonly buttonLabelKey?: string
  /** A name that is not a message and is shown as it is (a parameter's name): shown in place of `labelKey`. */
  readonly label?: string
  /** A line of explanation under the name, shown as it is (a parameter's description). */
  readonly detail?: string
  /** Whether the user has starred what it names (a parameter): the palette marks the row. */
  readonly starred?: boolean
  /** The message that names its group (Navigate, Vehicle). */
  readonly groupKey: string
  /** Messages with more words to find it by: each holds words separated by spaces. */
  readonly keywordKeys?: readonly string[]
  /** The key to show in its row (a plain string, filled from the keymap), when it has one. */
  readonly shortcut?: string
  /** True for a command that does something to the vehicle that must be meant (the reboot): it is never boosted by recent use. */
  readonly dangerous?: boolean
  /** False for a command the palette does not offer in its list (one that is the palette itself); it still runs by its id. */
  readonly listed?: boolean
  /** An icon of the kit's set (lib/ui/icons), for the places that draw one: the rail, a button, a row of the palette. */
  readonly icon?: IconName
  /** The route a command that goes to a place leads to: a control draws a real link with it (middle click, the status bar). */
  readonly href?: string
  /** Whether it may run now, and if not, why. */
  isEnabled(ctx: CommandContext): Availability
  /** Whether it is what the user is in now (the screen that is shown): a control marks it as the current one. */
  isActive?(ctx: CommandContext): boolean
  /** What to ask before it runs; null (or no method) when nothing needs asking. */
  confirmation?(ctx: CommandContext): SafetyOptions | null
  /** Does it. */
  execute(ctx: CommandContext): Promise<CommandOutcome> | CommandOutcome
}

/** A source of commands that are not a fixed list (parameters, later): asked for those that match a query. */
export interface CommandProvider {
  /** Unique among the commands and providers. */
  readonly id: string
  /** The commands for a (non-empty) query. */
  search(query: string, ctx: CommandContext): Command[]
}

/** How a call to `invoke` ended. */
export type InvokeResult
  = | { status: 'done', outcome: CommandOutcome }
    | { status: 'disabled', reasonKey: string, reasonParams?: Record<string, unknown> }
    | { status: 'cancelled' }
    | { status: 'failed', error: unknown }
    | { status: 'unknown' }
