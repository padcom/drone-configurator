// The recording of the connections, as the mock backend tells it (`recording.state`, `recording.dismiss`): it reads the same
// settings entries the real backend does (`recording.enabled`, `recording.folder`, `recording.limitMb`), and says a recording is
// being made while a vehicle is connected and recording is on. It writes nothing, and nothing fails unless a test says so.
import type { Connection, RecordingFailure, RecordingState, Settings } from '@/generated/app'
import { flagOf } from '@/lib/map/mapPrefs'
import {
  RECORDING_DEFAULT_LIMIT, RECORDING_ENABLED_KEY, RECORDING_FOLDER_KEY, RECORDING_LIMIT_KEY,
} from '@/lib/recording/recordingPrefs'

/** The folder the mock says it records into when none is set. */
export const MOCK_RECORDINGS = '/mock/data/recordings'

/** The name of the mock's recording. */
export const MOCK_RECORDING = '2026-11-24_10-15-30.tlog'

/**
 * The value of a settings entry.
 *
 * @param settings the settings
 * @param key the key
 * @returns its value, or undefined
 */
function entry(settings: Settings, key: string): string | undefined {
  return settings.ui.find(one => one.key === key)?.value
}

/** The mock's recording. */
export class MockRecording {
  /** The failure a test makes it say, until it is dismissed. */
  failure: RecordingFailure | undefined
  /** The recordings a test says the limit removed. */
  removed = 0

  /**
   * What the recording is doing.
   *
   * @param settings the settings the backend holds
   * @param connection the vehicle's connection
   * @returns the state
   */
  state(settings: Settings, connection: Connection): RecordingState {
    const enabled = flagOf(entry(settings, RECORDING_ENABLED_KEY), true)
    const folder = entry(settings, RECORDING_FOLDER_KEY) || MOCK_RECORDINGS
    const limitMb = Number(entry(settings, RECORDING_LIMIT_KEY) ?? RECORDING_DEFAULT_LIMIT)
    const base = { enabled, folder, limitMb, bytes: 0, removed: this.removed, removedBytes: this.removed * 1_000_000 }

    return { ...base, ...this.#now(enabled && connection.state === 'connected', folder) }
  }

  /**
   * What is being made now: the recording of a connected vehicle, or the failure.
   *
   * @param recording whether a connected vehicle is recorded
   * @param folder the folder
   * @returns the members that say so
   */
  #now(recording: boolean, folder: string): Partial<RecordingState> {
    if (this.failure !== undefined) {
      return { failure: this.failure }
    }

    return recording ? { key: `recorded/${MOCK_RECORDING}`, path: `${folder}/${MOCK_RECORDING}`, bytes: 48_000 } : {}
  }
}
