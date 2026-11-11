// What the rail holds: a list of command ids, in ONE table. The screens' "Switch to ..." commands in the order of the rail, with
// Settings pinned at the bottom, apart from the screens of the flight work. The rail draws a button for each (components/shell/
// Rail.vue, CommandButton.vue); a later change can make the list the user's own without touching what draws it. (A screen that
// has no command, such as the development gallery, is drawn after these by the rail itself.)

/** The commands of the rail. */
export interface RailCommands {
  /** In the main part of the rail, top to bottom. */
  main: readonly string[]
  /** Pinned at the bottom. */
  end: readonly string[]
}

/** The rail, as it is today. */
export const RAIL_COMMANDS: RailCommands = {
  main: ['go.flight', 'go.plan', 'go.setup', 'go.parameters', 'go.tune', 'go.logs'],
  end: ['go.settings'],
}
