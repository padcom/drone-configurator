// The settings the backend keeps for the interface (#19): the language and the interface's own entries, and the notice
// the backend gives about how they were read. It talks to the backend through the client (docs/frontend-state.md). The
// language the backend has is applied to the messages at once.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from '@/backend/client'
import type { Settings, SettingsState } from '@/generated/app'
import { type Language, type LegacyLanguage, isLanguage } from '@/i18n/i18n'
import { say } from '@/i18n/say'

/** What the settings need from the rest of the interface. */
export interface SettingsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** Shows the interface in this language. */
  applyLanguage: (language: Language) => void
  /** The language an earlier version kept in the browser's storage, to be moved into the settings; null if none can be. */
  legacy: LegacyLanguage | null
}

/** The settings, as refs and actions. */
export interface SettingsModel {
  /** The settings as the backend last said them (the defaults until it has). */
  readonly settings: ShallowRef<Settings>
  /** What the backend says about the settings file (it was set aside, it cannot be written), or that it cannot be asked. */
  readonly notice: ShallowRef<string | null>
  /** Whether the settings have been read (or could not be): what the interface keeps in them is known only then. */
  readonly loaded: ShallowRef<boolean>
  /** Reads the settings, applies them, and moves a language kept by an earlier version into them. */
  load: () => Promise<void>
  /** The text the interface kept under `key` (an entry of its own: a layout, the tab last used), or nothing. */
  uiValue: (key: string) => string | undefined
  /** Keeps the language of the interface (and shows the interface in it); if it cannot be kept, `notice` says so. */
  setLanguage: (language: Language) => Promise<void>
  /** Keeps a text under `key`; if it cannot be kept, `notice` says so. */
  setUi: (key: string, value: string) => Promise<void>
  /** The backend says the settings changed (also when this window did not ask). */
  changed: (state: SettingsState) => void
  /** Hides the notice, until the backend says something else. */
  dismissNotice: () => void
}

class SettingsLink implements SettingsModel {
  readonly settings = shallowRef<Settings>({ version: 1, ui: [] })
  readonly notice = shallowRef<string | null>(null)
  readonly loaded = shallowRef(false)
  /** The notice the user dismissed: not shown again while the backend keeps repeating it. */
  private dismissed: string | null = null

  /**
   * Makes the settings.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: SettingsDeps) {}

  /**
   * Takes what the backend said: the settings, the notice, and the language they name.
   *
   * @param state what the backend said
   */
  private adopt(state: SettingsState): void {
    this.settings.value = state.settings
    this.showNotice(state.notice)
    this.applyLanguage(state.settings.language)
  }

  /**
   * Shows the interface in the language the settings name, if it has messages for it.
   *
   * @param language the settings' language, if they have one
   */
  private applyLanguage(language: string | undefined): void {
    if (isLanguage(language)) {
      this.deps.applyLanguage(language)
    }
  }

  /**
   * Shows the backend's notice, unless the user dismissed those very words. A backend that says nothing ends the notice,
   * and with it the dismissal: the same words, when they come back, are news.
   *
   * @param notice what the backend said, if anything
   */
  private showNotice(notice: string | undefined): void {
    if (notice === undefined) {
      this.dismissed = null
    }
    this.notice.value = notice === undefined || notice === this.dismissed ? null : notice
  }

  /** Moves the language an earlier version kept in storage into the settings, unless they already have one. */
  private async importLanguage(): Promise<void> {
    const old = this.deps.legacy?.read() ?? null
    if (old !== null) {
      await this.moveLanguage(old)
    }
  }

  /**
   * Puts a language that was kept in storage into the settings, unless they have one, and forgets the stored one.
   *
   * @param old the language that was kept
   */
  private async moveLanguage(old: Language): Promise<void> {
    if (this.settings.value.language === undefined) {
      this.adopt(await this.deps.client.call('settings.set', { language: old }))
    }
    this.deps.legacy?.forget()
  }

  async load(): Promise<void> {
    try {
      this.adopt(await this.deps.client.call('settings.get', null))
      await this.importLanguage()
    } catch (error) {
      this.notice.value = say('notice.settingsUnavailable', { error: describeError(error) })
    } finally {
      this.loaded.value = true
    }
  }

  uiValue(key: string): string | undefined {
    return this.settings.value.ui.find(entry => entry.key === key)?.value
  }

  async setLanguage(language: Language): Promise<void> {
    try {
      this.changed(await this.deps.client.call('settings.set', { language }))
    } catch (error) {
      this.notice.value = say('notice.settingKept', { error: describeError(error) })
    }
  }

  async setUi(key: string, value: string): Promise<void> {
    try {
      this.changed(await this.deps.client.call('settings.set', { ui: [{ key, value }] }))
    } catch (error) {
      this.notice.value = say('notice.settingKept', { error: describeError(error) })
    }
  }

  changed(state: SettingsState): void {
    this.adopt(state)
  }

  dismissNotice(): void {
    this.dismissed = this.notice.value
    this.notice.value = null
  }
}

/**
 * Makes the settings.
 *
 * @param deps the client and the rest of the interface
 * @returns the refs and the actions
 */
export function useSettings(deps: SettingsDeps): SettingsModel {
  return new SettingsLink(deps)
}
