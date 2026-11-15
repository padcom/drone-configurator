// The setting "Changing the flight mode of an armed vehicle": nothing is asked, or a plain confirmation naming the mode (the
// default: the safe one). RTL, Land, Loiter and Brake never ask whatever it says: delay is the hazard there (leader's decision
// Q9). A disarmed vehicle is never asked. The Settings screen is the only place that changes it.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { useConfigurator } from './useConfigurator'

/** The key of the settings entry that holds the choice. */
export const MODE_CONFIRMATION_KEY = 'confirm.mode'

/** The levels the choice can have. */
export const MODE_CONFIRMATION_LEVELS = ['plain', 'none'] as const

/** One of the levels. */
export type ModeConfirmation = typeof MODE_CONFIRMATION_LEVELS[number]

/**
 * The level in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns `none` when the entry says so, else the default, `plain` (anything that is not understood is the safe one)
 */
export function parseModeConfirmation(text: string | undefined): ModeConfirmation {
  return text === 'none' ? 'none' : 'plain'
}

/** What was chosen and the settings have not answered for yet: shown at once. */
const local = shallowRef<ModeConfirmation | null>(null)

/** Forgets a choice that the settings have not answered for (for the tests: the choice is shared by the whole page). */
export function forgetModeConfirmationChoice(): void {
  local.value = null
}

/** The setting, as a ref and an action. */
export interface ModeConfirmationSetting {
  /** What a change of the mode of an armed vehicle asks. */
  level: ComputedRef<ModeConfirmation>
  /** Chooses it: it shows at once, and goes back to what the settings hold if they could not keep it (they say why). */
  choose: (level: ModeConfirmation) => Promise<void>
}

/**
 * The setting "Changing the flight mode of an armed vehicle".
 *
 * @returns what is asked, and how to change that
 */
export function useModeConfirmation(): ModeConfirmationSetting {
  const { settings } = useConfigurator()
  const level = computed(() => local.value ?? parseModeConfirmation(settings.uiValue(MODE_CONFIRMATION_KEY)))

  /**
   * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold.
   *
   * @param next the level
   */
  async function choose(next: ModeConfirmation): Promise<void> {
    local.value = next
    await settings.setUi(MODE_CONFIRMATION_KEY, next)

    // A newer choice, made before the answer, is left to its own answer.
    if (local.value === next) {
      local.value = null
    }
  }

  return { level, choose }
}
