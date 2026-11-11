// The setting "Show parameter groups" (off unless the settings say on): the Settings screen is the only place that changes
// it. When it is off the Parameters screen has no group list, no stars and no `*` key, and the list is of every parameter. The
// favourites in the settings are not touched: they are there when the groups are on again.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { useConfigurator } from './useConfigurator'
import { useParamGroup } from './useParamGroup'

/** The key of the settings entry that holds the choice: `on`, or anything else (or nothing) for off. */
export const GROUPS_KEY = 'params.groups'

/**
 * The choice in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns true when it says `on` (a choice that was made), false for anything else (a missing entry is the default, off)
 */
export function parseGroups(text: string | undefined): boolean {
  return text === 'on'
}

/** What was chosen and the settings have not answered for yet: shown at once (shared by the parts of the screen). */
const local = shallowRef<boolean | null>(null)

/** The setting, as a ref and an action. */
export interface GroupsSetting {
  /** Whether the groups (and the stars) are shown. */
  shown: ComputedRef<boolean>
  /** Chooses it: it shows at once, and goes back to what the settings hold if they could not keep it (they say why). */
  choose: (shown: boolean) => Promise<void>
}

/**
 * The setting "Show parameter groups".
 *
 * @returns whether the groups are shown, and how to change that
 */
export function useGroupsSetting(): GroupsSetting {
  const { settings } = useConfigurator()
  const shown = computed(() => local.value ?? parseGroups(settings.uiValue(GROUPS_KEY)))

  /**
   * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold. Turning the groups
   * off puts the scope back to All, so that a group chosen before does not stay in force with no list to say so.
   *
   * @param next whether the groups are shown
   */
  async function choose(next: boolean): Promise<void> {
    local.value = next

    if (!next) {
      useParamGroup().choose('')
    }
    await settings.setUi(GROUPS_KEY, next ? 'on' : 'off')

    // A newer choice, made before the answer, is left to its own answer.
    if (local.value === next) {
      local.value = null
    }
  }

  return { shown, choose }
}
