// The settings of guided control: how a Go here is confirmed (a plain confirmation unless the user chose none or a hold), what
// to do when the
// vehicle's GCS failsafe is off (block unless the user chose to be warned), and how high, how far from home and how fast it
// may be asked to
// go. The Settings screen is the only place that changes them; anything the settings hold that is not one of the choices is
// the default.
import { type ComputedRef, computed, shallowRef } from 'vue'
import {
  GUIDED_DEFAULTS, type GuidedPreferences, MAX_ALTITUDES, MAX_DISTANCES, MAX_SPEEDS, SPEEDS, confirmationOf, failsafeOf, numberOf,
} from '@/lib/fly/guided'
import { useConfigurator } from './useConfigurator'

/** The keys of the settings entries. */
export const GUIDED_KEYS = {
  confirmation: 'guided.confirmation',
  failsafe: 'guided.failsafe',
  maxAltitude: 'guided.maxAltitude',
  maxDistance: 'guided.maxDistance',
  maxSpeed: 'guided.maxSpeed',
  speed: 'guided.speed',
} as const

/** Which of the preferences. */
export type GuidedKey = keyof typeof GUIDED_KEYS

/** What was chosen and the settings have not answered for yet: shown at once. */
const local = shallowRef<Partial<Record<GuidedKey, string>>>({})

/** Forgets the choices that the settings have not answered for (for the tests: the choice is shared by the whole page). */
export function forgetGuidedChoices(): void {
  local.value = {}
}

/** The settings, as a ref and an action. */
export interface GuidedSettings {
  /** What the user chose. */
  prefs: ComputedRef<GuidedPreferences>
  /** Chooses one: it shows at once, and goes back to what the settings hold if they could not keep it. */
  choose: (key: GuidedKey, value: string) => Promise<void>
}

/**
 * The settings of guided control.
 *
 * @returns what they are, and how to change one
 */
export function useGuidedPreferences(): GuidedSettings {
  const { settings } = useConfigurator()
  const held = (key: GuidedKey): string | undefined => local.value[key] ?? settings.uiValue(GUIDED_KEYS[key])
  const prefs = computed<GuidedPreferences>(() => ({
    confirmation: confirmationOf(held('confirmation')),
    failsafe: failsafeOf(held('failsafe')),
    maxAltitude: numberOf(held('maxAltitude'), MAX_ALTITUDES, GUIDED_DEFAULTS.maxAltitude),
    maxDistance: numberOf(held('maxDistance'), MAX_DISTANCES, GUIDED_DEFAULTS.maxDistance),
    maxSpeed: numberOf(held('maxSpeed'), MAX_SPEEDS, GUIDED_DEFAULTS.maxSpeed),
    speed: numberOf(held('speed'), SPEEDS, GUIDED_DEFAULTS.speed),
  }))

  /**
   * Shows a choice at once, has the settings keep it, and, once they have answered, shows what they hold.
   *
   * @param key which
   * @param value what was chosen
   */
  async function choose(key: GuidedKey, value: string): Promise<void> {
    local.value = { ...local.value, [key]: value }
    await settings.setUi(GUIDED_KEYS[key], value)

    // A newer choice, made before the answer, is left to its own answer.
    if (local.value[key] === value) {
      const rest = { ...local.value }
      delete rest[key]
      local.value = rest
    }
  }

  return { prefs, choose }
}
