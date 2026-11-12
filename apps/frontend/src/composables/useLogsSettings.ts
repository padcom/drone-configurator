// The preferences about logs: whether to download them after landing (off unless the settings say on, for the disk's sake), how
// long to keep downloaded ones, and how much room they may take. They are kept in the settings; nothing acts on them yet (the
// backend that downloads, and removes, comes later), and the Settings screen says so.
import { type ComputedRef, computed, shallowRef } from 'vue'
import { useConfigurator } from './useConfigurator'

/** The keys of the settings entries. */
export const AUTO_DOWNLOAD_KEY = 'logs.autoDownload'

export const RETENTION_KEY = 'logs.retentionDays'

export const SIZE_CAP_KEY = 'logs.sizeCapMb'

/** What the choices are, and what is chosen until the settings say otherwise. */
export const RETENTION_DAYS = ['30', '90', '180', '365'] as const

export const SIZE_CAPS_MB = ['500', '2000', '5000', '10000'] as const

export const DEFAULT_RETENTION = '90'

export const DEFAULT_SIZE_CAP = '2000'

/**
 * A choice among the ones offered.
 *
 * @param text what the settings hold, if anything
 * @param choices what can be chosen
 * @param fallback what a missing or unknown entry means
 * @returns the choice
 */
export function choiceOf(text: string | undefined, choices: readonly string[], fallback: string): string {
  return text !== undefined && choices.includes(text) ? text : fallback
}

/** The preferences, as refs and actions. */
export interface LogsSettings {
  /** Whether logs are downloaded after landing (never while armed): off by default. */
  autoDownload: ComputedRef<boolean>
  /** How many days a downloaded log is kept. */
  retentionDays: ComputedRef<string>
  /** How much room (MB) the downloaded logs may take. */
  sizeCapMb: ComputedRef<string>
  /** Chooses whether to download after landing. */
  chooseAutoDownload: (on: boolean) => Promise<void>
  /** Chooses how many days to keep. */
  chooseRetention: (days: string) => Promise<void>
  /** Chooses the room (MB). */
  chooseSizeCap: (megabytes: string) => Promise<void>
}

/** What was chosen and the settings have not answered for yet: shown at once. */
const pending = shallowRef<Record<string, string>>({})

/** Forgets the choices the settings have not answered for (for the tests: they are shared by the whole page). */
export function forgetLogsChoices(): void {
  pending.value = {}
}

/**
 * The preferences about logs.
 *
 * @returns what is chosen, and how to choose
 */
export function useLogsSettings(): LogsSettings {
  const { settings } = useConfigurator()
  const held = (key: string) => pending.value[key] ?? settings.uiValue(key)

  /**
   * Shows a choice at once and has the settings keep it.
   *
   * @param key the settings entry
   * @param value the choice
   */
  async function choose(key: string, value: string): Promise<void> {
    pending.value = { ...pending.value, [key]: value }
    await settings.setUi(key, value)

    if (pending.value[key] === value) {
      const rest = { ...pending.value }
      delete rest[key]
      pending.value = rest
    }
  }

  return {
    autoDownload: computed(() => held(AUTO_DOWNLOAD_KEY) === 'on'),
    retentionDays: computed(() => choiceOf(held(RETENTION_KEY), RETENTION_DAYS, DEFAULT_RETENTION)),
    sizeCapMb: computed(() => choiceOf(held(SIZE_CAP_KEY), SIZE_CAPS_MB, DEFAULT_SIZE_CAP)),
    chooseAutoDownload: on => choose(AUTO_DOWNLOAD_KEY, on ? 'on' : 'off'),
    chooseRetention: days => choose(RETENTION_KEY, days),
    chooseSizeCap: megabytes => choose(SIZE_CAP_KEY, megabytes),
  }
}
