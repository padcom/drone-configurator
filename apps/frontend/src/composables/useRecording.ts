// Recording the connections (#30): what the backend says it is doing (`recording.state`, and `recording.changed` whenever that
// changes: a recording that starts, grows, ends or fails, and old recordings removed for the limit), and the preferences, which
// are entries of the settings document that the BACKEND reads at each connection (so this model only edits them, and shows a
// choice at once). A recording that failed is said until it is dismissed or the next one starts; the old recordings removed for
// the limit are told once, as a toast.
import { type ComputedRef, type ShallowRef, computed, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import type { RecordingState } from '@/generated/app'
import { say } from '@/i18n/say'
import { flagOf, pickOf } from '@/lib/map/mapPrefs'
import {
  RECORDING_DEFAULT_LIMIT,
  RECORDING_ENABLED_KEY,
  RECORDING_FOLDER_KEY,
  RECORDING_LIMITS_MB,
  RECORDING_LIMIT_KEY,
} from '@/lib/recording/recordingPrefs'
import { useToasts } from './toasts'
import type { SettingsModel } from './useSettings'

/** What the model needs. */
export interface RecordingDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The settings, whose `ui` entries hold the preferences. */
  settings: SettingsModel
}

/** The recording of the connections. */
export interface RecordingModel {
  /** What the backend last said, or null before it has. */
  readonly state: ShallowRef<RecordingState | null>
  /** Whether connections are recorded (on by default). */
  readonly enabled: ComputedRef<boolean>
  /** The folder chosen in the settings ('' for the default). */
  readonly folder: ComputedRef<string>
  /** The limit, in megabytes ('0' for none). */
  readonly limitMb: ComputedRef<string>
  /** What the last call that failed said. */
  readonly error: ShallowRef<string | null>
  /** Chooses a preference (it shows at once), and asks the backend again. */
  choose: (key: string, value: string) => Promise<void>
  /** Asks the backend what it is doing. */
  refresh: () => Promise<void>
  /** Forgets the failure that is shown. */
  dismiss: () => Promise<void>
}

/** The model. */
class Recording implements RecordingModel {
  readonly state = shallowRef<RecordingState | null>(null)
  readonly error = shallowRef<string | null>(null)
  readonly enabled: ComputedRef<boolean>
  readonly folder: ComputedRef<string>
  readonly limitMb: ComputedRef<string>
  readonly #pending = shallowRef<Record<string, string>>({})

  /**
   * Makes the model, and listens to the backend.
   *
   * @param deps the client and the settings
   */
  constructor(private readonly deps: RecordingDeps) {
    const held = (key: string) => this.#pending.value[key] ?? deps.settings.uiValue(key)
    this.enabled = computed(() => flagOf(held(RECORDING_ENABLED_KEY), true))
    this.folder = computed(() => held(RECORDING_FOLDER_KEY) ?? '')
    this.limitMb = computed(() => pickOf(held(RECORDING_LIMIT_KEY), RECORDING_LIMITS_MB, RECORDING_DEFAULT_LIMIT))
    deps.client.onEvent('recording.changed', next => {
      this.take(next)
    })
  }

  /**
   * Takes what the backend said, and tells of the recordings it removed since it last said.
   *
   * @param next the new state
   */
  take(next: RecordingState): void {
    const before = this.state.value
    this.state.value = next

    if (before !== null && next.removed > before.removed) {
      useToasts().push({ severity: 'info', text: say('recording.removedToast', { count: next.removed - before.removed }) })
    }
  }

  async choose(key: string, value: string): Promise<void> {
    this.#pending.value = { ...this.#pending.value, [key]: value }
    await this.deps.settings.setUi(key, value)

    if (this.#pending.value[key] === value) {
      const rest = { ...this.#pending.value }
      delete rest[key]
      this.#pending.value = rest
    }
    await this.refresh()
  }

  async refresh(): Promise<void> {
    await this.#ask('recording.state')
  }

  async dismiss(): Promise<void> {
    await this.#ask('recording.dismiss')
  }

  /**
   * Asks the backend, and keeps what it says.
   *
   * @param method which question
   */
  async #ask(method: 'recording.state' | 'recording.dismiss'): Promise<void> {
    try {
      this.take(await this.deps.client.call(method, null))
      this.error.value = null
    } catch (error) {
      this.error.value = describeError(error)
    }
  }
}

/**
 * The recording of the connections.
 *
 * @param deps the client and the settings
 * @returns the model
 */
export function useRecording(deps: RecordingDeps): RecordingModel {
  return new Recording(deps)
}
