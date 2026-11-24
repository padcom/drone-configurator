// The preferences about recording the connections (#30), as the settings keep them (strings in the settings' `ui` entries). The
// BACKEND reads the same entries at each connection (apps/backend/recording.pi), so these keys and values are a contract with it:
// the page only edits them.
import type { RecordingFailure, RecordingState } from '@/generated/app'

/** The keys of the settings entries. */
export const RECORDING_ENABLED_KEY = 'recording.enabled'

export const RECORDING_FOLDER_KEY = 'recording.folder'

export const RECORDING_LIMIT_KEY = 'recording.limitMb'

/** The limits that can be chosen (megabytes; 0 is none). */
export const RECORDING_LIMITS_MB = ['500', '1000', '2000', '5000', '10000', '20000', '0'] as const

/** The limit until the settings say otherwise (the backend's default too). */
export const RECORDING_DEFAULT_LIMIT = '2000'

/** The library's folder of the recordings: their keys are `recorded/<name>`. */
export const RECORDED_PREFIX = 'recorded/'

/**
 * Whether a key of the library names a recording this app made.
 *
 * @param key the key
 * @returns true if it does
 */
export function isRecordedKey(key: string): boolean {
  return key.startsWith(RECORDED_PREFIX)
}

/**
 * The key of the words for why a recording stopped.
 *
 * @param failure what the backend said
 * @returns the i18n key under `recording.failure`
 */
export function failureKey(failure: RecordingFailure): string {
  return `recording.failure.${failure.code}`
}

/**
 * What the recording is doing, in one word: `off` (turned off), `failed`, `recording` (a recording is being made) or `idle` (on,
 * waiting for a connection).
 *
 * @param state what the backend said, or null before it has
 * @returns the word
 */
export function recordingPhase(state: RecordingState | null): RecordingPhase {
  const { failure, enabled, key } = { enabled: true, ...state }
  if (failure !== undefined) {
    return 'failed'
  }
  if (!enabled) {
    return 'off'
  }

  return key === undefined ? 'idle' : 'recording'
}

/** What the recording is doing, in one word. */
export type RecordingPhase = 'off' | 'failed' | 'recording' | 'idle'
