// Which commands were run last: the palette lists the most recently used first. Kept per user in the settings, under one key of
// the interface's own (a JSON array of command ids, newest first, at most RECENT_MAX), like the favourites. Every read is
// guarded: an entry that is missing, is not JSON, or is not a list of texts is an empty list, and an id that is no command (one
// that was removed) is only ignored by whoever reads it.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { useConfigurator } from './useConfigurator'

/** The key of the settings entry that holds the list. */
export const RECENT_KEY = 'commands.recent'

/** How many commands are remembered. */
export const RECENT_MAX = 20

/**
 * The ids in a settings entry.
 *
 * @param text what the settings hold under the key, if anything
 * @returns the ids, newest first (none for an entry that is missing or is not a list of texts)
 */
export function parseRecent(text: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(text ?? '[]')

    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

/**
 * The list with a command put first (and taken out where it was), at most RECENT_MAX long.
 *
 * @param ids the list, newest first
 * @param id the command that was run
 * @returns the new list
 */
export function withUsed(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter(other => other !== id)].slice(0, RECENT_MAX)
}

/** The list that the settings have not answered for yet: shown at once (shared by every reader). */
const local = shallowRef<string[] | null>(null)

/** How long after the last command that was run the list is written to the settings (ms): not on every navigation. */
export const WRITE_MS = 500

let timer: ReturnType<typeof setTimeout> | undefined

/** Forgets what the settings have not answered for, and the write that waits (for the tests: it is shared by the whole page). */
export function forgetUsage(): void {
  clearTimeout(timer)
  local.value = null
}

/** The commands run lately, as a ref and an action. */
export interface CommandUsage {
  /** The ids, the one run last first. */
  recent: ComputedRef<string[]>
  /** Notes that a command was run: it is first from now on, at once; the settings are written a moment later. */
  record: (id: string) => void
}

/**
 * The commands run lately, kept in the settings. A recording shows at once and is written a moment after the last one (a run
 * of commands is one write, not one for each). It is not worth a notice: when the settings cannot keep it nothing is said, and
 * the list is what this session made of it.
 *
 * @returns the list and how to add to it
 */
export function useCommandUsage(): CommandUsage {
  const { settings } = useConfigurator()
  const recent = computed(() => local.value ?? parseRecent(settings.uiValue(RECENT_KEY)))

  /** Writes the list, quietly; once the settings hold it, they are what is shown. */
  async function flush(): Promise<void> {
    const next = local.value
    if (next === null) {
      return
    }
    const text = JSON.stringify(next)
    await settings.setUi(RECENT_KEY, text, true)

    // A newer recording, made before the answer, is left to its own write. One the settings did not keep stays as it is.
    if (local.value === next && settings.uiValue(RECENT_KEY) === text) {
      local.value = null
    }
  }

  return {
    recent,
    record: id => {
      local.value = withUsed(recent.value, id)
      clearTimeout(timer)
      timer = setTimeout(() => void flush(), WRITE_MS)
    },
  }
}
