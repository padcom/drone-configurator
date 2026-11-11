// The setting "Show a notification when a command runs" (off unless the settings say on): for debugging, and later for scripts.
// When it is on, every command that was run (from the palette, a key or a button) raises a toast with its label. The Settings
// screen is the only place that changes it.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { useConfigurator } from './useConfigurator'

/** The key of the settings entry that holds the choice: `on`, or anything else (or nothing) for off. */
export const NOTICE_KEY = 'commands.notify'

/**
 * The choice in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns true when it says `on`, false for anything else (a missing entry is the default, off)
 */
export function parseNotice(text: string | undefined): boolean {
  return text === 'on'
}

/** What was chosen and the settings have not answered for yet: shown at once. */
const local = shallowRef<boolean | null>(null)

/** Forgets a choice that the settings have not answered for (for the tests: the choice is shared by the whole page). */
export function forgetNoticeChoice(): void {
  local.value = null
}

/** The setting, as a ref and an action. */
export interface CommandNotice {
  /** Whether a command that runs raises a notification. */
  shown: ComputedRef<boolean>
  /** Chooses it: it shows at once, and goes back to what the settings hold if they could not keep it (they say why). */
  choose: (shown: boolean) => Promise<void>
}

/**
 * The setting "Show a notification when a command runs".
 *
 * @returns whether commands are announced, and how to change that
 */
export function useCommandNotice(): CommandNotice {
  const { settings } = useConfigurator()
  const shown = computed(() => local.value ?? parseNotice(settings.uiValue(NOTICE_KEY)))

  /**
   * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold.
   *
   * @param next whether commands are announced
   */
  async function choose(next: boolean): Promise<void> {
    local.value = next
    await settings.setUi(NOTICE_KEY, next ? 'on' : 'off')

    // A newer choice, made before the answer, is left to its own answer.
    if (local.value === next) {
      local.value = null
    }
  }

  return { shown, choose }
}
