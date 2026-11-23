// The keys as the user has set them over the defaults (lib/app/bindings.ts), kept in the settings under one key as a
// text. The keymap (lib/app/keymap.ts) is told at once, so that a key changed in Settings works as soon as it is
// chosen, and the Shell tells it at start (`useCommandKeys`) so that the keys are the user's whichever screen is shown.
// Anything in the settings that is not a choice for a key that may be rebound is left out.
import { type ComputedRef, computed, shallowRef } from 'vue'
import type { Chord } from '@/lib/app/chords'
import {
  type Binding,
  type Overrides,
  type Rebinding,
  applyOverrides,
  parseOverrides,
  rebind,
  serialiseOverrides,
  takeOver,
  without,
} from '@/lib/app/bindings'
import { KEYS, setBindings } from '@/lib/app/keymap'
import { useConfigurator } from './useConfigurator'

/** The key of the settings entry that holds the choices. */
export const KEY_BINDINGS_KEY = 'keys.bindings'

/** The actions whose keys may be changed. */
export const REBINDABLE: readonly string[] = KEYS.filter(key => !key.fixed).map(key => key.actionId)

/** What was chosen and the settings have not answered for yet: shown at once. */
const local = shallowRef<Overrides | null>(null)

/** Forgets a choice that the settings have not answered for (for the tests: the choice is shared by the whole page). */
export function forgetKeyBindingChoice(): void {
  local.value = null
}

/** The keys, as a ref and the actions that change them. */
export interface KeyBindingSetting {
  /** What the user chose over the defaults. */
  overrides: ComputedRef<Overrides>
  /** The keys in force: the defaults with the choices over them. */
  keys: ComputedRef<Binding[]>
  /** Gives an action a chord, or no key (null); where the chord is another action's nothing changes and they are named. */
  set: (actionId: string, chord: Chord | null) => Promise<Rebinding>
  /** Gives an action a chord that others have, and takes it from them. */
  take: (actionId: string, chord: Chord) => Promise<Rebinding>
  /** Puts an action back to its default key. */
  reset: (actionId: string) => Promise<void>
  /** Puts every key back to its default. */
  resetAll: () => Promise<void>
}

/**
 * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold.
 *
 * @param next the choices
 * @param keepInSettings has the settings keep the text
 * @param held what the settings hold
 */
async function keep(next: Overrides, keepInSettings: (text: string) => Promise<void>, held: () => Overrides): Promise<void> {
  local.value = next
  setBindings(next)
  await keepInSettings(serialiseOverrides(next))

  // A newer choice, made before the answer, is left to its own answer.
  if (local.value === next) {
    local.value = null
    setBindings(held())
  }
}

/**
 * The keys of the application as the user has them.
 *
 * @returns what they are, and how to change them
 */
export function useKeyBindings(): KeyBindingSetting {
  const { settings } = useConfigurator()
  const overrides = computed(() => local.value ?? parseOverrides(settings.uiValue(KEY_BINDINGS_KEY), REBINDABLE))
  const keepText = (text: string): Promise<void> => settings.setUi(KEY_BINDINGS_KEY, text)
  const save = (next: Overrides): Promise<void> => keep(next, keepText, () => overrides.value)
  const done = async (result: Rebinding): Promise<Rebinding> => {
    if (result.status === 'done') {
      await save(result.overrides)
    }

    return result
  }

  return {
    overrides,
    keys: computed(() => applyOverrides(KEYS, overrides.value)),
    set: (actionId, chord) => done(rebind(KEYS, overrides.value, actionId, chord)),
    take: (actionId, chord) => done(takeOver(KEYS, overrides.value, actionId, chord)),
    reset: actionId => save(without(overrides.value, actionId)),
    resetAll: () => save({}),
  }
}
