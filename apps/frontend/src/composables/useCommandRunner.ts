// Running a command from the interface: what the palette, the rail and the buttons do when they are asked for a command. All go
// through the registry's `invoke` (enabled, confirmation, check again, execute), and what follows is the same for all: the focus
// goes where the command says, and a command that failed, or could no longer run, says so in a toast.
import { useI18n } from 'vue-i18n'
import type { Command, CommandContext, FocusTarget, InvokeResult } from '@/lib/commands/command'
import { focusSearch } from '@/lib/params/paramShortcuts'
import { askForFocus } from './useFocusIntent'
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
 * Runs commands for the interface.
 *
 * @returns the function that runs a command (by id, or the command itself) and sees to what follows
 */
export function useCommandRunner(): (target: string | Command, from?: RunFrom) => Promise<InvokeResult> {
  const { t } = useI18n()
  const registry = useCommands()
  const ctx: CommandContext = useCommandContext()
  const toasts = useToasts()

  /**
   * Says that a command did not run: it failed, or it could no longer run.
   *
   * @param result how the command ended
   */
  const complain = (result: InvokeResult): void => {
    if (result.status === 'failed') {
      toasts.push({ id: 'command-failed', severity: 'error', text: t('palette.failed') })
    } else if (result.status === 'disabled') {
      toasts.push({ id: 'command-disabled', severity: 'warning', text: ctx.say(result.reasonKey, result.reasonParams) })
    }
  }

  return async (target, from = 'control') => {
    const result = await registry.invoke(target, ctx)
    if (result.status !== 'done') {
      complain(result)
    } else if (result.outcome.focus !== undefined) {
      PLACES[result.outcome.focus](from)
    }

    return result
  }
}
