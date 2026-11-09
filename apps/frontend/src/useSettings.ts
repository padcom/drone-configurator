// The settings the backend keeps for the interface (#19): the theme and the language, and the notice the backend gives
// about how they were read. It talks to the backend through the client (docs/frontend-state.md). What the backend
// has is applied to the interface at once: the theme to the page, the language to the messages.
import { type ShallowRef, shallowRef } from 'vue'
import { type BackendClient, describeError } from './backend/client'
import type { FirstPaint } from './firstPaint'
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
  /** The copy of the theme kept for the first paint (the settings come after the page is drawn); null without storage. */
  firstPaint: FirstPaint | null
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

/** What the caller knows about the settings it adopts. */
interface Adoption {
  /** False when the theme is not to be touched (a later choice is waiting for its answer). */
  theme?: boolean
  /** True the first time the settings are read: the theme is then applied whatever it was before. */
  first?: boolean
}

class SettingsLink implements SettingsModel {
  readonly settings = shallowRef<Settings>({ version: 1, ui: [] })
  readonly notice = shallowRef<string | null>(null)
  /** The notice the user dismissed: not shown again while the backend keeps repeating it. */
  private dismissed: string | null = null
  /** The theme choices made so far (the last one is the one that counts). */
  private latest = 0
  /** The theme choices the backend has not answered yet. */
  private pending = 0

  /**
   * Makes the settings. The copy of the theme kept for the first paint is applied at once, before anything is drawn.
   *
   * @param deps the client and the rest of the interface
   */
  constructor(private readonly deps: SettingsDeps) {
    const copy = deps.firstPaint?.read() ?? null
    if (copy !== null) {
      deps.theme.set(copy)
    }
  }

  /**
   * Whether the theme the backend said is to be put on the page: when it is the first time the settings are read, or when
   * it is not the theme they had, and not when a later choice is waiting for its answer.
   *
   * @param state what the backend said
   * @param how what the caller knows of it
   * @returns true to apply the theme
   */
  private themeWanted(state: SettingsState, how: Adoption): boolean {
    return how.theme !== false && (how.first === true || state.settings.theme !== this.settings.value.theme)
  }

  /**
   * Takes what the backend said: the settings, the notice, and the theme and language they name.
   *
   * @param state what the backend said
   * @param how what the caller knows of it
   */
  private adopt(state: SettingsState, how: Adoption = {}): void {
    const wanted = this.themeWanted(state, how)
    this.settings.value = state.settings
    this.showNotice(state.notice)

    if (wanted) {
      this.applyTheme(state.settings.theme)
    }
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

  /**
   * Puts a theme on the page and keeps the copy for the first paint: what the settings do not name is the system's.
   *
   * @param theme the settings' theme, if they have one
   */
  private applyTheme(theme: ThemeName | undefined): void {
    this.deps.theme.set(theme ?? 'system')
    this.deps.firstPaint?.write(theme ?? null)
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
      this.adopt(await this.deps.client.call('settings.get', null), { first: true })
      await this.importLanguage()
    } catch (error) {
      this.notice.value = `The settings are not available: ${describeError(error)}`
    }
  }

  changed(state: SettingsState): void {
    // While a choice is waiting for its answer, an announcement may be of an older one: the answer says the theme.
    this.adopt(state, { theme: this.pending === 0 })
  }

  async chooseTheme(next: ThemeName): Promise<void> {
    this.deps.theme.set(next)
    this.deps.firstPaint?.write(next)
    this.latest += 1
    const mine = this.latest
    this.pending += 1

    try {
      const state = await this.deps.client.call('settings.set', { theme: next })
      if (mine === this.latest) {
        this.adopt(state)
      } else {
        // The answer to a choice that has been replaced: the later one's answer says what the settings are.
        this.showNotice(state.notice)
      }
    } catch (error) {
      this.notice.value = `The theme could not be kept: ${describeError(error)}`
    } finally {
      this.pending -= 1
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
