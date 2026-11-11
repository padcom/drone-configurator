// The registry of commands, and the one way to run one: `invoke`. Commands (a fixed list) and providers (commands made for a
// query, such as parameters) are registered here; the palette lists, filters and calls `invoke` and has no behaviour of its own.
import type { Availability, Command, CommandContext, CommandProvider, InvokeResult } from './command'
import { rankCommands } from './search'

/** The most commands one provider adds to the result of a search. */
export const PROVIDED_MAX = 8

/**
 * Whether a registered thing is a provider (it searches) and not a command (it runs).
 *
 * @param entry a command or a provider
 * @returns true for a provider
 */
function isProvider(entry: Command | CommandProvider): entry is CommandProvider {
  return 'search' in entry
}

/**
 * Whether a command may not run now.
 *
 * @param command the command
 * @param ctx the context
 * @returns the result that says so, or null when it may run
 */
function refusal(command: Command, ctx: CommandContext): InvokeResult | null {
  const check = command.isEnabled(ctx)

  return check.enabled ? null : { status: 'disabled', reasonKey: check.reasonKey, reasonParams: check.reasonParams }
}

/**
 * Asks the confirmation of a command, if it has one.
 *
 * @param command the command
 * @param ctx the context
 * @returns true when it asked and the answer was no
 */
async function declined(command: Command, ctx: CommandContext): Promise<boolean> {
  const question = command.confirmation?.(ctx) ?? null

  return question !== null && !await ctx.confirm(question)
}

/** The commands the application has, and the protocol that runs them. */
export class CommandRegistry {
  private readonly commands: Command[] = []

  private readonly providers: CommandProvider[] = []

  /**
   * Adds a command, or a provider of commands.
   *
   * @param entry what to add
   * @returns the function that takes it out again
   * @throws {Error} when something with the same id is registered
   */
  register(entry: Command | CommandProvider): () => void {
    const taken = [...this.commands, ...this.providers].some(known => known.id === entry.id)
    if (taken) {
      throw new Error(`A command or provider with the id ${entry.id} is already registered`)
    }
    const list: { id: string }[] = isProvider(entry) ? this.providers : this.commands
    list.push(entry)

    return () => {
      const at = list.indexOf(entry)
      if (at >= 0) {
        list.splice(at, 1)
      }
    }
  }

  /**
   * The registered commands, in the order they were registered (providers' commands are not in it).
   *
   * @returns a copy of the list
   */
  list(): Command[] {
    return [...this.commands]
  }

  /**
   * One registered command.
   *
   * @param id its id
   * @returns the command, or undefined
   */
  get(id: string): Command | undefined {
    return this.commands.find(command => command.id === id)
  }

  /**
   * Whether a registered command may run now.
   *
   * @param id its id
   * @param ctx the context
   * @returns whether it may, and if not why; undefined when there is no such command
   */
  availability(id: string, ctx: CommandContext): Availability | undefined {
    return this.get(id)?.isEnabled(ctx)
  }

  /**
   * The commands for what the user typed. An empty query gives every registered command in registry order; a query gives
   * those that match, best first, and then what the providers have for it (at most `PROVIDED_MAX` each).
   *
   * @param query what was typed
   * @param ctx the context
   * @returns the commands to list
   */
  search(query: string, ctx: CommandContext): Command[] {
    const found = rankCommands(this.commands, query, ctx)
    if (query.trim() === '') {
      return found
    }
    const provided = this.providers.flatMap(provider => provider.search(query, ctx).slice(0, PROVIDED_MAX))

    return [...found, ...provided]
  }

  /**
   * Runs a command, the one way a command runs: it must be enabled; if it asks for a confirmation the user must give it; it
   * must still be enabled after that (the vehicle may have armed while the question was open); then it runs. An exception
   * is a result, never thrown at the caller.
   *
   * @param target the id of a registered command, or a command a provider made
   * @param ctx the context
   * @returns how it ended
   */
  async invoke(target: string | Command, ctx: CommandContext): Promise<InvokeResult> {
    const command = typeof target === 'string' ? this.get(target) : target
    if (command === undefined) {
      return { status: 'unknown' }
    }
    try {
      return await this.run(command, ctx)
    } catch (error) {
      return { status: 'failed', error }
    }
  }

  /**
   * The steps of `invoke`, which lets an exception out.
   *
   * @param command the command
   * @param ctx the context
   * @returns how it ended
   */
  private async run(command: Command, ctx: CommandContext): Promise<InvokeResult> {
    const before = refusal(command, ctx)
    if (before !== null) {
      return before
    }
    if (await declined(command, ctx)) {
      return { status: 'cancelled' }
    }
    const after = refusal(command, ctx)
    if (after !== null) {
      return after
    }

    return { status: 'done', outcome: await command.execute(ctx) }
  }
}
