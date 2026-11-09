import { describe, expect, it, vi } from 'vitest'
import { type BackendClient, createBackendClient } from './backend/client'
import type { Settings } from './generated/app'
import type { Language, LegacyLanguage } from './i18n'
import { mockBackend } from './mock-backend'
import { useSettings } from './useSettings'

const EMPTY: Settings = { version: 1, ui: [] }
const CORRUPT = { notice: 'set aside', noticeCode: 'CORRUPT' }

/** What a rig starts from. */
interface Start {
  /** What the "file" holds. */
  saved?: Settings
  /** The notice the backend gives about it. */
  notice?: { notice: string, noticeCode: string }
  /** The language an earlier version kept in the browser. */
  legacy?: Language
}

/**
 * Settings on a mock backend, with a theme and a language that record what they are told.
 *
 * @param start what the backend holds and says, and what the browser kept
 * @returns the settings, and what they applied
 */
function rig(start: Start = {}) {
  const client = createBackendClient(mockBackend({ settings: start.saved ?? EMPTY, settingsNotice: start.notice }))
  const theme = { set: vi.fn() }
  const applyLanguage = vi.fn()
  const forget = vi.fn()
  const legacy: LegacyLanguage | null = start.legacy ? { read: () => start.legacy ?? null, forget } : null

  return { client, theme, applyLanguage, forget, settings: useSettings({ client, theme, applyLanguage, legacy }) }
}

/** A client whose every call fails. */
const refusing = {
  call: () => Promise.reject(new Error('the backend is gone')),
} as unknown as BackendClient

/**
 * Settings whose backend cannot be asked.
 *
 * @param legacy what an earlier version kept in the browser
 * @returns the settings, and what they applied
 */
function refused(legacy: LegacyLanguage | null = null) {
  const theme = { set: vi.fn() }

  return { theme, settings: useSettings({ client: refusing, theme, applyLanguage: vi.fn(), legacy }) }
}

describe('loading what was kept', () => {
  it('applies the theme and the language that were kept, and shows the notice the backend gives', async () => {
    const saved: Settings = { version: 1, theme: 'dark', language: 'en', ui: [] }
    const { settings, theme, applyLanguage } = rig({ saved, notice: CORRUPT })

    await settings.load()

    expect(theme.set).toHaveBeenCalledWith('dark')
    expect(applyLanguage).toHaveBeenCalledWith('en')
    expect(settings.settings.value.theme).toBe('dark')
    expect(settings.notice.value).toBe('set aside')
  })
})

describe('loading when nothing was kept, or it cannot be had', () => {
  it('leaves the theme and the language alone when none was kept, and says nothing', async () => {
    const { settings, theme, applyLanguage } = rig()

    await settings.load()

    expect(theme.set).not.toHaveBeenCalled()
    expect(applyLanguage).not.toHaveBeenCalled()
    expect(settings.notice.value).toBeNull()
  })

  it('does not apply a language the interface has no messages for, and keeps what the settings say', async () => {
    const { settings, applyLanguage } = rig({ saved: { version: 1, language: 'xx', ui: [] } })

    await settings.load()

    expect(applyLanguage).not.toHaveBeenCalled()
    expect(settings.settings.value.language).toBe('xx')
  })

  it('says the settings are not available when the backend cannot be asked, and applies nothing', async () => {
    const { settings, theme } = refused()

    await settings.load()

    expect(settings.notice.value).toBe('The settings are not available: the backend is gone')
    expect(theme.set).not.toHaveBeenCalled()
  })
})

describe('choosing a theme', () => {
  it('shows it at once and keeps it in the settings', async () => {
    const { settings, theme, client } = rig()
    await settings.load()

    const kept = settings.chooseTheme('light')
    expect(theme.set).toHaveBeenLastCalledWith('light')
    await kept

    expect(settings.settings.value.theme).toBe('light')
    expect((await client.call('settings.get', null)).settings.theme).toBe('light')
  })

  it('still shows it when it could not be kept, and says so', async () => {
    const { settings, theme } = refused()

    await settings.chooseTheme('dark')

    expect(theme.set).toHaveBeenCalledWith('dark')
    expect(settings.notice.value).toBe('The theme could not be kept: the backend is gone')
  })
})

describe('the language an earlier version kept in the browser', () => {
  it('moves into the settings, and is forgotten', async () => {
    const { settings, client, forget, applyLanguage } = rig({ legacy: 'en' })

    await settings.load()

    expect(settings.settings.value.language).toBe('en')
    expect((await client.call('settings.get', null)).settings.language).toBe('en')
    expect(applyLanguage).toHaveBeenCalledWith('en')
    expect(forget).toHaveBeenCalledOnce()
  })

  it('does not replace a language the settings already have, but is forgotten', async () => {
    const { settings, client, forget } = rig({ saved: { version: 1, language: 'xx', ui: [] }, legacy: 'en' })

    await settings.load()

    expect((await client.call('settings.get', null)).settings.language).toBe('xx')
    expect(forget).toHaveBeenCalledOnce()
  })

  it('stays where it is when it could not be moved', async () => {
    const forget = vi.fn()
    const { settings } = refused({ read: () => 'en', forget })

    await settings.load()

    expect(forget).not.toHaveBeenCalled()
  })
})

describe('the notice', () => {
  it('is hidden when dismissed, and not shown again while the backend repeats it', async () => {
    const { settings } = rig({ notice: CORRUPT })
    await settings.load()

    settings.dismissNotice()
    expect(settings.notice.value).toBeNull()
    settings.changed({ settings: EMPTY, ...CORRUPT })

    expect(settings.notice.value).toBeNull()
  })

  it('comes back when the backend says something else', async () => {
    const { settings } = rig({ notice: CORRUPT })
    await settings.load()
    settings.dismissNotice()

    settings.changed({ settings: EMPTY, notice: 'cannot be written', noticeCode: 'NOT_WRITABLE' })

    expect(settings.notice.value).toBe('cannot be written')
  })

  it('goes when the backend stops saying it', async () => {
    const { settings } = rig({ notice: { notice: 'cannot be written', noticeCode: 'NOT_WRITABLE' } })
    await settings.load()

    settings.changed({ settings: EMPTY })

    expect(settings.notice.value).toBeNull()
  })
})

describe('a change the backend announces', () => {
  it('is applied, also when this window did not ask for it', () => {
    const { settings, theme } = rig()

    settings.changed({ settings: { version: 1, theme: 'dark', ui: [] } })

    expect(theme.set).toHaveBeenCalledWith('dark')
    expect(settings.settings.value.theme).toBe('dark')
  })
})
