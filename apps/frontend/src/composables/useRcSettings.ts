// What the RC control keeps in the settings: whether it is allowed (off unless the settings say on: the Settings screen is
// the only place that changes it) and the mapping of each device. A choice shows at once, and goes back to what the settings
// hold when they could not keep it (they say why).
import { type ComputedRef, computed, shallowRef } from 'vue'
import { useConfigurator } from './useConfigurator'
import type { SettingsModel } from './useSettings'
import { RC_ALLOW_KEY, parseAllow, parseProfile, profileKey, serialiseProfile } from '@/lib/rc/store'
import type { Profile } from '@/lib/rc/types'

/** The settings of the RC control, as refs and actions. */
export interface RcSettings {
  /** Whether RC control is allowed (off by default). */
  allowed: ComputedRef<boolean>
  /** Allows it, or not. */
  allow: (on: boolean) => Promise<void>
  /** The mapping kept for a device, or null. */
  profileOf: (device: string) => Profile | null
  /** Keeps the mapping of a device. */
  save: (profile: Profile) => Promise<void>
}

/** What was chosen and the settings have not answered for yet. */
const local = shallowRef<boolean | null>(null)

/**
 * Forgets a choice that the settings have not answered for (for the tests: the choice is shared by the whole page).
 */
export function forgetRcAllowChoice(): void {
  local.value = null
}

/**
 * The settings of the RC control.
 *
 * @param settings the settings (the Configurator's by default; the Configurator itself gives its own while it is being made)
 * @returns what is allowed, the mappings, and how to change them
 */
export function useRcSettings(settings: SettingsModel = useConfigurator().settings): RcSettings {
  const allowed = computed(() => local.value ?? parseAllow(settings.uiValue(RC_ALLOW_KEY)))

  return {
    allowed,
    allow: async (on: boolean): Promise<void> => {
      local.value = on
      await settings.setUi(RC_ALLOW_KEY, on ? 'on' : 'off')
      local.value = null
    },
    profileOf: (device: string): Profile | null => parseProfile(settings.uiValue(profileKey(device)), device),
    save: (profile: Profile): Promise<void> => settings.setUi(profileKey(profile.device), serialiseProfile(profile)),
  }
}
