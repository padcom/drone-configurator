// Running a command from the interface: what the palette, the rail and the buttons do when they are asked for a command. All go
// through the registry's `invoke` (enabled, confirmation, check again, execute), and what follows is the same for all: the focus
// goes where the command says, and a command that failed, or could no longer run, says so in a toast.
import { useI18n } from 'vue-i18n'
import type { Command, CommandContext, FocusTarget, InvokeResult } from '@/lib/commands/command'
import { focusSearch } from '@/lib/params/paramShortcuts'
import { askForFocus } from './useFocusIntent'
import { useCommandNotice } from './useCommandNotice'
import { useCommandUsage } from './useCommandUsage'
import { useCommandContext, useCommands } from './useCommands'
import { useToasts } from './toasts'

/** Who asked: the palette (its dialog was open, and the focus is to be put into what it opened), or a control on the page. */
export type RunFrom = 'palette' | 'control'

/**
 * Puts the focus into the screen that a command opened, when that is what asked: the element that had it before the palette
 * opened is in a screen that is hidden now. A click on the rail (a control) keeps the focus where it is, on the rail.
 *
 * @param from who asked
 */
function focusScreen(from: RunFrom): void {
  if (from === 'palette') {
    document.querySelector<HTMLElement>('.app-main')?.focus()
  }
}

/**
 * Puts the focus in the Parameters screen's search box. When the box is on the page it goes there at once; when it is not (the
 * screen is loaded when it is first shown, and kept alive, out of the page, when it is not) the box takes the focus itself when
 * it is shown (ParamFilter, `takeFocus`): nothing waits for it, and a slow load still gets it.
 */
function focusParamSearch(): void {
  if (document.getElementById('filter')) {
    focusSearch()
  } else {
    askForFocus('params.search')
  }
}

/** Where the focus goes for each place a command can name. Anything else leaves it where it is. */
const PLACES: Record<FocusTarget, (from: RunFrom) => void> = {
  'restore': () => undefined,
  'main': focusScreen,
  'params.search': focusParamSearch,
}

/**
 * Says that a command did not run (it failed, or it could no longer run) in a toast.
 *
 * @returns the function that says it for a result
 */
function useComplaint(): (result: InvokeResult) => void {
  const { t } = useI18n()
  const ctx: CommandContext = useCommandContext()
  const toasts = useToasts()

  return result => {
    if (result.status === 'failed') {
      toasts.push({ id: 'command-failed', severity: 'error', text: t('palette.failed') })
    } else if (result.status === 'disabled') {
      toasts.push({ id: 'command-disabled', severity: 'warning', text: ctx.say(result.reasonKey, result.reasonParams) })
    }
  }
}

/**
 * Whether the palette lists a command: it is registered, and not one that is the palette itself.
 *
 * @param registered the registered command with the id, if there is one
 * @returns true when it is listed
 */
function isListed(registered: Command | undefined): boolean {
  return registered !== undefined && registered.listed !== false
}

/**
 * What is kept and said about a command that ran. It is the one run last (the palette lists it first; one that is not in the
 * list, such as a parameter a provider made or the palette's own command, is not remembered). When the setting "Show a
 * notification when a command runs" is on, a toast says which command ran (for debugging, and later for scripts).
 *
 * @returns the function that notes a command that ran
 */
function useRunNote(): (command: Command) => void {
  const registry = useCommands()
  const ctx: CommandContext = useCommandContext()
  const toasts = useToasts()
  const usage = useCommandUsage()
  const notice = useCommandNotice()

  return command => {
    if (isListed(registry.get(command.id))) {
      void usage.record(command.id)
    }
    if (notice.shown.value) {
      toasts.push({ severity: 'success', text: command.label ?? ctx.say(command.labelKey) })
    }
  }
}

/**
 * What follows a command that was asked for: a complaint when it did not run, else a note of it and the focus where it says.
 *
 * @param result how it ended
 * @param command the command, when it is known
 * @param from who asked
 * @param follow the notes and the complaint
 * @param follow.note notes a command that ran
 * @param follow.complain says that a command did not run
 */
function followUp(
  result: InvokeResult,
  command: Command | undefined,
  from: RunFrom,
  follow: { note: (command: Command) => void, complain: (result: InvokeResult) => void },
): void {
  if (result.status !== 'done') {
    follow.complain(result)

    return
  }
  if (command !== undefined) {
    follow.note(command)
  }
  PLACES[result.outcome.focus ?? 'restore'](from)
}

/**
 * Runs commands for the interface.
 *
 * @returns the function that runs a command (by id, or the command itself) and sees to what follows
 */
export function useCommandRunner(): (target: string | Command, from?: RunFrom) => Promise<InvokeResult> {
  const registry = useCommands()
  const ctx: CommandContext = useCommandContext()
  const follow = { complain: useComplaint(), note: useRunNote() }

  return async (target, from = 'control') => {
    const result = await registry.invoke(target, ctx)
    followUp(result, typeof target === 'string' ? registry.get(target) : target, from, follow)

    return result
  }
}
