// The preferences about logs, as the settings keep them (strings in the settings' ui entries): the keys, what can be chosen, and
// the defaults. They are here, not in a composable, because the things that act on them (the auto-download after landing and the
// removal of old copies) are made when the configurator is, before any component asks for them.

/** The keys of the settings entries. */
export const AUTO_DOWNLOAD_KEY = 'logs.autoDownload'

export const RETENTION_KEY = 'logs.retentionDays'

export const SIZE_CAP_KEY = 'logs.sizeCapMb'

/** What the choices are: days (0 = never remove an old copy), and megabytes (0 = no limit). */
export const RETENTION_DAYS = ['30', '90', '180', '365', '0'] as const

export const SIZE_CAPS_MB = ['500', '2000', '5000', '10000', '0'] as const

/** What is chosen until the settings say otherwise. */
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

/** The preferences as numbers: days (0 = never), megabytes (0 = no limit), and whether to download after landing. */
export interface LogsPrefs {
  /** How many days a downloaded copy is kept (0 = for ever). */
  retentionDays: number
  /** How many megabytes the copies may take together (0 = no limit). */
  sizeCapMb: number
  /** Whether the newest log is downloaded after landing. */
  autoDownload: boolean
}

/**
 * The preferences as numbers, from what the settings hold.
 *
 * @param value reads a settings entry
 * @returns the retention in days and the cap in megabytes (0 turns a rule off), and whether the auto-download is on
 */
export function logsPrefsOf(value: (key: string) => string | undefined): LogsPrefs {
  return {
    retentionDays: Number(choiceOf(value(RETENTION_KEY), RETENTION_DAYS, DEFAULT_RETENTION)),
    sizeCapMb: Number(choiceOf(value(SIZE_CAP_KEY), SIZE_CAPS_MB, DEFAULT_SIZE_CAP)),
    autoDownload: value(AUTO_DOWNLOAD_KEY) === 'on',
  }
}
