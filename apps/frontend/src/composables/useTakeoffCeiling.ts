// The setting "Highest takeoff": how high a takeoff may be asked for (m above home), 50 m unless the user chose another. The
// vehicle's own fence, when it limits the altitude, is lower than it if it is (lib/fly/takeoff.ts). The Settings screen is the
// only place that changes it. Anything the settings hold that is not one of the choices is the default.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { TAKEOFF_CEILINGS, TAKEOFF_DEFAULT_CEILING_M } from '@/lib/fly/takeoff'
import { useConfigurator } from './useConfigurator'

/** The key of the settings entry that holds the choice. */
export const TAKEOFF_CEILING_KEY = 'takeoff.ceiling'

/**
 * The ceiling in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns metres: one of the choices, else the default
 */
export function parseCeiling(text: string | undefined): number {
  const value = Number(text)

  return TAKEOFF_CEILINGS.some(choice => choice === value) ? value : TAKEOFF_DEFAULT_CEILING_M
}

/** What was chosen and the settings have not answered for yet: shown at once. */
const local = shallowRef<number | null>(null)

/** Forgets a choice that the settings have not answered for (for the tests: the choice is shared by the whole page). */
export function forgetTakeoffCeilingChoice(): void {
  local.value = null
}

/** The setting, as a ref and an action. */
export interface TakeoffCeilingSetting {
  /** The highest altitude a takeoff may be asked for (m above home). */
  ceiling: ComputedRef<number>
  /** Chooses it: it shows at once, and goes back to what the settings hold if they could not keep it. */
  choose: (metres: number) => Promise<void>
}

/**
 * The setting "Highest takeoff".
 *
 * @returns what it is, and how to change it
 */
export function useTakeoffCeiling(): TakeoffCeilingSetting {
  const { settings } = useConfigurator()
  const ceiling = computed(() => local.value ?? parseCeiling(settings.uiValue(TAKEOFF_CEILING_KEY)))

  /**
   * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold.
   *
   * @param next the altitude
   */
  async function choose(next: number): Promise<void> {
    local.value = next
    await settings.setUi(TAKEOFF_CEILING_KEY, String(next))

    // A newer choice, made before the answer, is left to its own answer.
    if (local.value === next) {
      local.value = null
    }
  }

  return { ceiling, choose }
}
