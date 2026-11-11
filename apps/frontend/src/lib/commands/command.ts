// The Command pattern for what the user can ask the application to do: go to a screen, reboot the flight controller. A command
// is a small object that knows its own label, whether it may run now (and if not, why), what to ask before it runs, and what it
// does. Nothing here draws anything or knows Vue: the palette (and later the top bar, the F-keys, the menus) only list commands
// and call `CommandRegistry.invoke`, which is the one way a command runs.
import type { Connection } from '@/generated/app'
import type { SearchIndex } from '@/lib/params/paramSearch'
import type { SafetyOptions } from '@/lib/app/safety'
import type { ToastInput } from '@/composables/toasts'

/** Whether a command may run now: it may, or it may not, for a reason that is a message of the interface. */
export type Availability
  = | { enabled: true }
    | { enabled: false, reasonKey: string, reasonParams?: Record<string, unknown> }

/** What a command leaves behind for the caller: where the focus goes once the palette has closed. */
export interface CommandOutcome {
  /** `restore`: back to what had it before the palette opened. `main`: into the screen (the old element may be hidden now). */
  focus?: 'restore' | 'main'
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

/** Everything a command may touch: the commands get nothing else, so a test can make a context of a few lines. */
export interface CommandContext {
  /** Goes to a route. */
  navigate(path: string): Promise<void>
  /** The parameters. */
  parameters: ParameterFacts
  /** The vehicle. */
  vehicle: VehicleFacts
  /** Asks the user to confirm (the one route for dangerous actions); false for "no" and for Escape. */
  confirm(options: SafetyOptions): Promise<boolean>
  /** Tells the user something short. */
  toast(input: ToastInput): void
  /** A message of the interface in the language of the page. */
  say(key: string, named?: Record<string, unknown>): string
  /** The same message in English, so that a command can be found by its English name in every language. */
  sayEnglish(key: string, named?: Record<string, unknown>): string
}

/** One thing the user can ask for. */
export interface Command {
  /** Unique and stable: `go.parameters`, `vehicle.reboot`. */
  readonly id: string
  /** The message that names it: the palette translates it, there is no text here. */
  readonly labelKey: string
  /** A name that is not a message and is shown as it is (a parameter's name): the palette uses it in place of `labelKey`. */
  readonly label?: string
  /** A line of explanation under the name, shown as it is (a parameter's description). */
  readonly detail?: string
  /** The message that names its group (Navigate, Vehicle). */
  readonly groupKey: string
  /** Messages with more words to find it by: each holds words separated by spaces. */
  readonly keywordKeys?: readonly string[]
  /** The key to show in its row (a plain string, filled from the keymap), when it has one. */
  readonly shortcut?: string
  /** Whether it may run now, and if not, why. */
  isEnabled(ctx: CommandContext): Availability
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
