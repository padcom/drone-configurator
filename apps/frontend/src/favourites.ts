// The favourite parameters: one global list of names, kept in the settings file under one key of the interface's own (not per
// vehicle: a name mostly belongs to a family, and a list that follows the user across vehicles needs no table of types). The
// Favourites group shows the ones the connected vehicle has. From plain values; `useFavourites` ties it to the settings.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { useConfigurator } from './useConfigurator'

/** The key of the settings entry that holds the list (a JSON array of names). */
export const FAVOURITES_KEY = 'params.favourites'

/** What the list may take at most, in characters of the entry (the settings keep 65,536 at most per value). */
export const MAX_FAVOURITES_CHARS = 60_000

/**
 * The names in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns the names (none for an entry that is missing or is not a list of texts)
 */
export function parseFavourites(text: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(text ?? '[]')

    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : []
  } catch {
    return []
  }
}

/**
 * The list with a name added, or taken out when it is there.
 *
 * @param names the favourites
 * @param id the parameter
 * @returns the new list
 */
export function toggled(names: readonly string[], id: string): string[] {
  return names.includes(id) ? names.filter(name => name !== id) : [...names, id]
}

/**
 * Whether a list fits in the settings entry.
 *
 * @param names the favourites
 * @returns true if it does
 */
export function fits(names: readonly string[]): boolean {
  return JSON.stringify(names).length <= MAX_FAVOURITES_CHARS
}

/** The favourites, as refs and an action. */
export interface Favourites {
  /** The names, in the order they were starred. */
  names: ComputedRef<string[]>
  /** The same as a set. */
  set: ComputedRef<ReadonlySet<string>>
  /**
   * Stars a parameter, or takes its star away.
   *
   * @returns false when the list would not fit in the settings (nothing is changed then)
   */
  toggle: (id: string) => Promise<boolean>
}

/**
 * The favourites, kept in the settings. A toggle shows at once (a second one that comes before the settings answer builds on
 * it), and goes back to what the settings say when they have answered, or could not keep it.
 *
 * @returns the favourites
 */
export function useFavourites(): Favourites {
  const { settings } = useConfigurator()
  const local = shallowRef<string[] | null>(null)
  const names = computed(() => local.value ?? parseFavourites(settings.uiValue(FAVOURITES_KEY)))
  const set = computed(() => new Set(names.value))

  return {
    names,
    set,
    toggle: async id => {
      const next = toggled(names.value, id)
      if (!fits(next)) {
        return false
      }
      local.value = next
      await settings.setUi(FAVOURITES_KEY, JSON.stringify(next))

      if (local.value === next) {
        local.value = null
      }

      return true
    },
  }
}
