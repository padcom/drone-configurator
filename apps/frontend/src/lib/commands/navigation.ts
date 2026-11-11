// Going to a screen. One command per screen of the product, made from the screens' own list, so that a new screen is in the
// palette without a change here (it needs a message `palette.go.<id>` in every locale, which a test checks).
import type { Command, CommandContext, CommandOutcome } from './command'
import { PRODUCT_SCREENS, type Screen } from '@/screens/registry'

/** The group of the commands that go to a screen. */
export const NAVIGATE_GROUP = 'palette.group.navigate'

/** The command that shows a screen. */
export class GoToScreen implements Command {
  readonly id: string

  readonly labelKey: string

  readonly groupKey = NAVIGATE_GROUP

  /**
   * Makes the command of a screen.
   *
   * @param screen the screen it goes to
   */
  constructor(private readonly screen: Screen) {
    this.id = `go.${screen.id}`
    // One whole message per screen and language, not a template with the screen's name in it: in Polish, Ukrainian and
    // Russian the name would need another ending.
    this.labelKey = `palette.go.${screen.id}`
  }

  /**
   * Going to a screen is always possible.
   *
   * @returns enabled
   */
  isEnabled(): { enabled: true } {
    return { enabled: true }
  }

  /**
   * Shows the screen.
   *
   * @param ctx the context
   * @returns where the focus goes: the screen's own place when it has one (the Parameters screen's search box, so that the user
   * can type at once), else into the screen (the element that had it is in a screen that is hidden now)
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    await ctx.navigate(this.screen.path)

    return { focus: this.screen.focus ?? 'main' }
  }
}

/**
 * The commands that go to the screens.
 *
 * @param screens the screens; those of the product (not the development gallery) when omitted
 * @returns one command for each, in the order of the screens
 */
export function goToScreens(screens: readonly Screen[] = PRODUCT_SCREENS): GoToScreen[] {
  return screens.map(screen => new GoToScreen(screen))
}
