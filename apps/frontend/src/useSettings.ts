// The settings the backend keeps for the interface (#19): the theme and the language, and the notice the backend gives
// about how they were read. It talks to the backend through the client (docs/frontend-state.md). What the backend
// has is applied to the interface at once: the theme to the page, the language to the messages.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from './backend/client'
import type { Settings, SettingsState, ThemeName } from './generated/app'
import { type Language, type LegacyLanguage, isLanguage } from './i18n'
import type { Theme } from './kit/useTheme'

/** What the settings need from the rest of the interface. */
export interface SettingsDeps {
  /** The link to the backend. */
  client: BackendClient
  /** The theme of the page. */
  theme: Pick<Theme, 'set'>
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
  /** Reads the settings, applies them, and moves a language kept by an earlier version into them. */
  load: () => Promise<void>
  /** The backend says the settings changed (also when this window did not ask). */
  changed: (state: SettingsState) => void
  /** Shows a theme at once and keeps the choice. */
  chooseTheme: (next: ThemeName) => Promise<void>
  /** Hides the notice, until the backend says something else. */
  dismissNotice: () => void
}

class SettingsLink implements SettingsModel {
  readonly settings = shallowRef<Settings>({ version: 1, ui: [] })
  readonly notice = shallowRef<string | null>(null)
  /** The notice the user dismissed: not shown again while the backend keeps repeating it. */
  private dismissed: string | null = null

  /**
   * Makes the settings.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: SettingsDeps) {}

  /**
   * Takes what the backend said: the settings, the notice, and the theme and language they name.
   *
   * @param state what the backend said
   */
  private adopt(state: SettingsState): void {
    this.settings.value = state.settings
    this.notice.value = state.notice !== undefined && state.notice !== this.dismissed ? state.notice : null
    this.apply(state.settings)
  }

  /**
   * Applies the theme and the language that the settings name; what they do not name is left as it is.
   *
   * @param settings the settings
   */
  private apply(settings: Settings): void {
    if (settings.theme !== undefined) {
      this.deps.theme.set(settings.theme)
    }
    if (isLanguage(settings.language)) {
      this.deps.applyLanguage(settings.language)
    }
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
      this.notice.value = `The settings are not available: ${describeError(error)}`
    }
  }

  changed(state: SettingsState): void {
    this.adopt(state)
  }

  async chooseTheme(next: ThemeName): Promise<void> {
    this.deps.theme.set(next)

    try {
      this.adopt(await this.deps.client.call('settings.set', { theme: next }))
    } catch (error) {
      this.notice.value = `The theme could not be kept: ${describeError(error)}`
    }
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
