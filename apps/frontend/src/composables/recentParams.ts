// The parameters used last: one global list of names, newest first, kept in the settings file under one key of the interface's
// own (as the favourites are, so it survives a restart and follows the user across vehicles). A parameter is used when it is
// opened (a click on its row, Enter in the list or the search, a related parameter pressed) or a new value of it is queued: not
// when the arrow keys pass over it. The Recently used group shows the ones the connected vehicle has.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { parseFavourites } from './favourites'
import { useConfigurator } from './useConfigurator'

/** The key of the settings entry that holds the list (a JSON array of names, newest first). */
export const RECENT_KEY = 'params.recent'

/** How many names the list keeps. */
export const MAX_RECENT = 20

/**
 * The list with a name put first.
 *
 * @param names the names, newest first
 * @param id the parameter used now
 * @returns the new list, at most MAX_RECENT long
 */
export function used(names: readonly string[], id: string): string[] {
  return [id, ...names.filter(name => name !== id)].slice(0, MAX_RECENT)
}

/** The recently used parameters, as refs and an action. */
export interface RecentParams {
  /** The names, newest first. */
  names: ComputedRef<string[]>
  /** The same as a set. */
  set: ComputedRef<ReadonlySet<string>>
  /** Puts a parameter first (nothing is written when it is first already). */
  touch: (id: string) => Promise<void>
}

/** What was used and the settings have not answered for yet (shared by the screen's parts). */
const local = shallowRef<string[] | null>(null)

/**
 * The recently used parameters, kept in the settings. A use shows at once, and goes back to what the settings hold when they have
 * answered (they swallow an error, and their own notice speaks).
 *
 * @returns the list and how to add to it
 */
export function useRecentParams(): RecentParams {
  const { settings } = useConfigurator()
  const names = computed(() => local.value ?? parseFavourites(settings.uiValue(RECENT_KEY)))
  const set = computed(() => new Set(names.value))

  /**
   * Puts a parameter first.
   *
   * @param id the parameter
   */
  async function touch(id: string): Promise<void> {
    if (names.value[0] === id) {
      return
    }
    const next = used(names.value, id)
    local.value = next
    await settings.setUi(RECENT_KEY, JSON.stringify(next))

    // A newer use, made before the answer, is left to its own answer.
    if (local.value === next) {
      local.value = null
    }
  }

  return { names, set, touch }
}
