import { describe, expect, it, vi } from 'vitest'
import { type BackendClient, createBackendClient } from './backend/client'
import type { Settings, SettingsState, ThemeName } from './generated/app'
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
  /** The theme the browser kept for the first paint. */
  copy?: ThemeName
}

/**
 * A copy of the theme for the first paint that records what is written to it.
 *
 * @param kept what it holds at first
 * @returns the copy, and its writes
 */
function copyOf(kept: ThemeName | null = null) {
  const write = vi.fn()

  return { copy: { read: () => kept, write }, write }
}

/**
 * The language an earlier version kept, if one did, with a record of its being forgotten.
 *
 * @param kept the language
 * @returns how to read and forget it (null when none was kept), and the record
 */
function legacyOf(kept?: Language) {
  const forget = vi.fn()
  const legacy: LegacyLanguage | null = kept ? { read: () => kept, forget } : null

  return { legacy, forget }
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
  const { legacy, forget } = legacyOf(start.legacy)
  const { copy, write } = copyOf(start.copy ?? null)
  const settings = useSettings({ client, theme, applyLanguage, legacy, firstPaint: copy })

  return { client, theme, applyLanguage, forget, write, settings }
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

  return { theme, settings: useSettings({ client: refusing, theme, applyLanguage: vi.fn(), legacy, firstPaint: null }) }
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
  it('goes to the system theme and leaves the language alone when none was kept, and says nothing', async () => {
    const { settings, theme, applyLanguage } = rig()

    await settings.load()

    expect(theme.set).toHaveBeenCalledOnce()
    expect(theme.set).toHaveBeenCalledWith('system')
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
})

describe('the notice, when the backend stops saying it or says it again', () => {
  it('goes when the backend stops saying it', async () => {
    const { settings } = rig({ notice: { notice: 'cannot be written', noticeCode: 'NOT_WRITABLE' } })
    await settings.load()

    settings.changed({ settings: EMPTY })

    expect(settings.notice.value).toBeNull()
  })

  it('is shown again when the same words come back after the backend said nothing in between', async () => {
    const { settings } = rig({ notice: CORRUPT })
    await settings.load()
    settings.dismissNotice()
    settings.changed({ settings: EMPTY })

    settings.changed({ settings: EMPTY, ...CORRUPT })

    expect(settings.notice.value).toBe('set aside')
  })
})

describe('the theme at the first paint', () => {
  it('is the copy kept in the browser, applied at once, before the settings are asked for', () => {
    const { theme } = rig({ copy: 'dark' })

    expect(theme.set).toHaveBeenCalledOnce()
    expect(theme.set).toHaveBeenCalledWith('dark')
  })

  it('applies nothing when there is no copy', () => {
    const { theme } = rig()

    expect(theme.set).not.toHaveBeenCalled()
  })
})

describe('the theme at the first paint, and the settings that follow it', () => {
  it('gives way to the settings, which are the truth, and the copy follows them', async () => {
    const { settings, theme, write } = rig({ copy: 'dark', saved: { version: 1, theme: 'light', ui: [] } })

    await settings.load()

    expect(theme.set).toHaveBeenLastCalledWith('light')
    expect(write).toHaveBeenLastCalledWith('light')
  })

  it('is forgotten when the settings name no theme, and the page goes to the system theme', async () => {
    const { settings, theme, write } = rig({ copy: 'dark' })

    await settings.load()

    expect(theme.set).toHaveBeenLastCalledWith('system')
    expect(write).toHaveBeenLastCalledWith(null)
  })

  it('is written when a theme is chosen, at once', async () => {
    const { settings, write } = rig()

    const kept = settings.chooseTheme('dark')
    expect(write).toHaveBeenCalledWith('dark')
    await kept
  })
})

/**
 * A client whose answers to `settings.set` come when the test says.
 *
 * @returns the client, and a way to answer the calls in the order the test likes
 */
function slowClient() {
  const answers: ((state: SettingsState) => void)[] = []
  const call = vi.fn(() => new Promise(resolve => {
    answers.push(resolve as (state: SettingsState) => void)
  }))

  return { client: { call } as unknown as BackendClient, answers }
}

describe('two theme choices in a row', () => {
  it('end on the later one, whatever order the answers come in', async () => {
    const { client, answers } = slowClient()
    const theme = { set: vi.fn() }
    const settings = useSettings({ client, theme, applyLanguage: vi.fn(), legacy: null, firstPaint: null })

    const first = settings.chooseTheme('dark')
    const second = settings.chooseTheme('light')
    answers[1]!({ settings: { version: 1, theme: 'light', ui: [] } })
    await second
    answers[0]!({ settings: { version: 1, theme: 'dark', ui: [] } })
    await first

    const shown = theme.set.mock.calls.map(call => call[0])
    expect(shown.at(-1)).toBe('light')
    expect(shown.lastIndexOf('dark')).toBe(0)
    expect(settings.settings.value.theme).toBe('light')
  })
})

describe('two theme choices in a row, with an announcement between', () => {
  it('are not undone by an announcement of the earlier one while the later waits for its answer', async () => {
    const { client, answers } = slowClient()
    const theme = { set: vi.fn() }
    const settings = useSettings({ client, theme, applyLanguage: vi.fn(), legacy: null, firstPaint: null })

    const first = settings.chooseTheme('dark')
    const second = settings.chooseTheme('light')
    settings.changed({ settings: { version: 1, theme: 'dark', ui: [] } })
    answers[0]!({ settings: { version: 1, theme: 'dark', ui: [] } })
    answers[1]!({ settings: { version: 1, theme: 'light', ui: [] } })
    await Promise.all([first, second])

    const shown = theme.set.mock.calls.map(call => call[0])
    expect(shown.at(-1)).toBe('light')
    expect(shown.lastIndexOf('dark')).toBe(0)
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
