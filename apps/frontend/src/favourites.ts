// The favourite parameters: one global list of names, kept in the settings file under one key of the interface's own (not per
// vehicle: a name mostly belongs to a family, and a list that follows the user across vehicles needs no table of types). The
// Favourites group shows the ones the connected vehicle has. From plain values; `useFavourites` ties it to the settings.
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
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
   * @returns how it went: `kept` (the settings have the list), `full` (it would not fit in the settings: nothing is changed) or
   * `failed` (the settings could not keep it: the star goes back, and the settings' own notice says why)
   */
  toggle: (id: string) => Promise<Kept>
  /**
   * Takes out the favourites that are not among `ids` (the parameters this vehicle has): the only way to get rid of the names
   * of another vehicle's parameters, which the list never shows.
   *
   * @returns how it went, as for `toggle`
   */
  keepOnly: (ids: ReadonlySet<string>) => Promise<Kept>
}

/** How keeping the list in the settings went. */
export type Kept = 'kept' | 'full' | 'failed'

/**
 * Keeps a list: it shows at once (in `local`), and goes back to what the settings say when they have answered.
 *
 * @param local what is shown until the settings have answered
 * @param settings keeps a text in the settings, and says what they hold
 * @param settings.setUi keeps a text
 * @param settings.uiValue what the settings hold under a key
 * @param next the new list
 * @returns how it went
 */
async function keepList(
  local: ShallowRef<string[] | null>,
  settings: { setUi: (key: string, value: string) => Promise<void>, uiValue: (key: string) => string | undefined },
  next: string[],
): Promise<Kept> {
  if (!fits(next)) {
    return 'full'
  }
  const text = JSON.stringify(next)
  local.value = next
  await settings.setUi(FAVOURITES_KEY, text)

  if (local.value === next) {
    local.value = null
  }

  // The settings swallow an error (their notice speaks): what they hold now says whether the list was kept.
  return settings.uiValue(FAVOURITES_KEY) === text ? 'kept' : 'failed'
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
  const keep = (next: string[]) => keepList(local, settings, next)

  return {
    names,
    set,
    toggle: id => keep(toggled(names.value, id)),
    keepOnly: ids => keep(names.value.filter(name => ids.has(name))),
  }
}
