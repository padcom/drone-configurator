// Parameters in the palette: typing a name, or a word of what a parameter does, offers the parameters that match, and choosing
// one shows it on the Parameters screen, selected. The parameters are found with the Parameters screen's own search
// (paramSearch.ts, on the one index that is made for the list and the metadata), so the same words find the same parameters
// in both places. A parameter the user has starred comes before the others that match as well. Nothing is written: this only
// goes to one.
import type { Command, CommandContext, CommandOutcome, CommandProvider } from './command'
import { type SearchHit, search } from '@/lib/params/paramSearch'
import { PROVIDED_MAX } from './registry'
import { PRODUCT_SCREENS } from '@/screens/registry'

/** Where the Parameters screen is, from the list of the screens (the route is not written out twice). */
const PARAMETERS_PATH = PRODUCT_SCREENS.find(screen => screen.id === 'parameters')?.path ?? '/parameters'

/** The group of the commands that go to a parameter. */
export const PARAMETER_GROUP = 'palette.group.parameter'

/** A query shorter than this finds no parameter: one letter is every parameter. */
export const MIN_QUERY = 2

/** The command that shows one parameter. */
export class GoToParameter implements Command {
  readonly id: string

  // The name is shown as it is: there is no message for it.
  readonly labelKey = ''

  readonly groupKey = PARAMETER_GROUP

  readonly label: string

  readonly detail: string

  readonly starred: boolean

  /**
   * Makes the command for a parameter.
   *
   * @param name the parameter's name
   * @param description its short description, if the metadata has one
   * @param starred whether the user has starred it (the palette marks it, so that the order has a visible reason)
   */
  constructor(name: string, description: string, starred = false) {
    this.id = `param.${name}`
    this.label = name
    this.detail = description
    this.starred = starred
  }

  /**
   * Going to a parameter is always possible: it is in the list the screen has.
   *
   * @returns enabled
   */
  isEnabled(): { enabled: true } {
    return { enabled: true }
  }

  /**
   * Shows the Parameters screen, with the search cleared and this parameter selected. It writes nothing.
   *
   * @param ctx the context
   * @returns the focus goes into the screen
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    await ctx.navigate(PARAMETERS_PATH)
    ctx.parameters.reveal(this.label)

    return { focus: 'main' }
  }
}

/** How the reasons of a hit rank: by name, then by description, then a close match. */
const REASON_ORDER = { name: 0, description: 1, close: 2 } as const

/**
 * The hits with the starred parameters first within each kind of match (a starred parameter that matches by its description does
 * not outrank one that matches by its name), and otherwise as the search ranked them.
 *
 * @param hits what the search found, best first
 * @param favourites the starred names
 * @returns the hits in the order to offer them
 */
export function favouritesFirst(hits: SearchHit[], favourites: ReadonlySet<string>): SearchHit[] {
  const rank = (hit: SearchHit) => REASON_ORDER[hit.reason] * 2 + (favourites.has(hit.id) ? 0 : 1)

  const ranked = hits.map((hit, order) => ({ hit, order }))

  return ranked.toSorted((a, b) => rank(a.hit) - rank(b.hit) || a.order - b.order).map(({ hit }) => hit)
}

/** The parameters, offered for a query of two letters or more. */
export class ParameterProvider implements CommandProvider {
  readonly id = 'parameters'

  /**
   * The parameters that match a query, starred ones first. Nothing when no parameters have been downloaded: they appear after a
   * vehicle is connected, and the palette does not list stubs for them.
   *
   * @param query what the user typed
   * @param ctx the context
   * @returns a command for each match (the registry keeps the first few)
   */
  search(query: string, ctx: CommandContext): Command[] {
    if (query.trim().length < MIN_QUERY) {
      return []
    }
    const index = ctx.parameters.searchIndex()
    if (index.entries.length === 0) {
      return []
    }
    const favourites = ctx.parameters.favourites()
    // Only the first few are made into commands (two letters match up to a thousand parameters).
    const hits = favouritesFirst(search(index, query), favourites).slice(0, PROVIDED_MAX)

    return hits.map(hit => new GoToParameter(hit.id, ctx.parameters.describe(hit.id), favourites.has(hit.id)))
  }
}
