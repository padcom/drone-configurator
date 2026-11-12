// Going to a screen. One command per screen of the product, made from the screens' own list, so that a new screen is in the
// palette without a change here (it needs a message `palette.go.<id>` in every locale, which a test checks).
import type { Command, CommandContext, CommandOutcome } from './command'
import type { IconName } from '@/lib/ui/icons'
import { PRODUCT_SCREENS, type Screen, type Section } from '@/screens/registry'

/** The group of the commands that go to a screen. */
export const NAVIGATE_GROUP = 'palette.group.navigate'

/**
 * Whether an address is a screen's own or one of its parts'.
 *
 * @param path the address that is shown
 * @param screenPath the screen's address
 * @returns true for `/logs` and `/logs/vehicle` under `/logs`, not for `/logsx`
 */
function isUnder(path: string, screenPath: string): boolean {
  const own = path.replace(/\/+$/u, '')

  return own === screenPath || own.startsWith(`${screenPath}/`)
}

/** The command that shows a screen. */
export class GoToScreen implements Command {
  readonly id: string

  readonly labelKey: string

  readonly groupKey = NAVIGATE_GROUP

  readonly icon: IconName

  // On the rail the words are the screen's name, as they always were.
  readonly buttonLabelKey: string

  readonly href: string

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
    this.icon = screen.icon
    this.buttonLabelKey = screen.titleKey
    this.href = screen.path
  }

  /**
   * Whether the screen is the one that is shown.
   *
   * @param ctx the context
   * @returns true for the current screen
   */
  isActive(ctx: CommandContext): boolean {
    // A screen with parts is the one that is shown whichever of its parts is.
    return isUnder(ctx.currentPath(), this.screen.path)
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

/** The command that shows one part of a screen ("Switch to Logs: On the vehicle"). */
export class GoToSection implements Command {
  readonly id: string

  readonly labelKey: string

  readonly groupKey = NAVIGATE_GROUP

  readonly icon: IconName

  readonly href: string

  /**
   * Makes the command of a part.
   *
   * @param screen the screen the part is in
   * @param section the part
   */
  constructor(private readonly screen: Screen, section: Section) {
    this.id = `go.${screen.id}.${section.id}`
    // One whole message for each, as for the screens: `palette.section.<screen>.<part>` (not under `palette.go`, where the
    // screen's own message is a string).
    this.labelKey = `palette.section.${screen.id}.${section.id}`
    this.icon = screen.icon
    this.href = `${screen.path}/${section.path}`
  }

  /**
   * Whether the part is the one that is shown.
   *
   * @param ctx the context
   * @returns true for its address
   */
  isActive(ctx: CommandContext): boolean {
    // (An address with a slash at its end is the same address.)
    return ctx.currentPath().replace(/\/+$/u, '') === this.href
  }

  /**
   * Going to a part is always possible.
   *
   * @returns enabled
   */
  isEnabled(): { enabled: true } {
    return { enabled: true }
  }

  /**
   * Shows the part.
   *
   * @param ctx the context
   * @returns the focus goes into the screen
   */
  async execute(ctx: CommandContext): Promise<CommandOutcome> {
    await ctx.navigate(this.href)

    return { focus: 'main' }
  }
}

/**
 * The commands that go to the parts of the screens, one for each part.
 *
 * @param screens the screens; those of the product when omitted
 * @returns the commands, in the order of the screens and their parts
 */
export function goToSections(screens: readonly Screen[] = PRODUCT_SCREENS): GoToSection[] {
  return screens.flatMap(screen => (screen.sections ?? []).map(section => new GoToSection(screen, section)))
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
