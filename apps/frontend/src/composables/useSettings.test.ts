import { describe, expect, it, vi } from 'vitest'
import { type BackendClient, createBackendClient } from '@/backend/client'
import type { Settings } from '@/generated/app'
import type { Language, LegacyLanguage } from '@/i18n/i18n'
import { mockBackend } from '@/mock/mock-backend'
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
/**
 * Settings on a mock backend, with a language that records what it is told.
 *
 * @param start what the backend holds and says, and what the browser kept
 * @returns the settings, and what they applied
 */
function rig(start: Start = {}) {
  const client = createBackendClient(mockBackend({ settings: start.saved ?? EMPTY, settingsNotice: start.notice }))
  const applyLanguage = vi.fn()
  const { legacy, forget } = legacyOf(start.legacy)
  const settings = useSettings({ client, applyLanguage, legacy })

  return { client, applyLanguage, forget, settings }
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
  const applyLanguage = vi.fn()

  return { applyLanguage, settings: useSettings({ client: refusing, applyLanguage, legacy }) }
}

describe('loading what was kept', () => {
  it('applies the language that was kept, and shows the notice the backend gives', async () => {
    const saved: Settings = { version: 1, language: 'en', ui: [] }
    const { settings, applyLanguage } = rig({ saved, notice: CORRUPT })

    await settings.load()

    expect(applyLanguage).toHaveBeenCalledWith('en')
    expect(settings.notice.value).toBe('set aside')
  })

  it('takes no notice of a theme an earlier version kept: there is only the dark one', async () => {
    const { settings } = rig({ saved: { version: 1, theme: 'light', ui: [] } })

    await settings.load()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('loading when nothing was kept, or it cannot be had', () => {
  it('leaves the language alone when none was kept, and says nothing', async () => {
    const { settings, applyLanguage } = rig()

    await settings.load()

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
    const { settings, applyLanguage } = refused()

    await settings.load()

    expect(settings.notice.value).toBe('The settings are not available: the backend is gone')
    expect(applyLanguage).not.toHaveBeenCalled()
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

describe('choosing the language', () => {
  it('sends the language to the backend, which keeps it, and shows the interface in the answer', async () => {
    const { settings, client, applyLanguage } = rig()
    const call = vi.spyOn(client, 'call')
    await settings.load()

    await settings.setLanguage('en')

    expect(call).toHaveBeenLastCalledWith('settings.set', { language: 'en' })
    expect(settings.settings.value.language).toBe('en')
    expect(applyLanguage).toHaveBeenLastCalledWith('en')
  })

  it('says in the notice that the choice could not be kept, when the backend cannot be asked', async () => {
    const { settings } = refused()

    await settings.setLanguage('en')

    expect(settings.notice.value).toBe('A setting could not be kept: the backend is gone')
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

describe('a change the backend announces', () => {
  it('is applied, also when this window did not ask for it', () => {
    const { settings, applyLanguage } = rig()

    settings.changed({ settings: { version: 1, language: 'en', ui: [] } })

    expect(applyLanguage).toHaveBeenCalledWith('en')
    expect(settings.settings.value.language).toBe('en')
  })
})

describe('whether the settings have been read', () => {
  it('is no until they are, and yes after', async () => {
    const { settings } = rig()
    expect(settings.loaded.value).toBe(false)

    await settings.load()

    expect(settings.loaded.value).toBe(true)
  })

  it('is yes also when they could not be read, so that nothing waits for them for ever', async () => {
    const { settings } = refused()

    await settings.load()

    expect(settings.loaded.value).toBe(true)
  })
})

describe('what the interface keeps for itself', () => {
  it('is read by its key, and is nothing for a key that is not there', async () => {
    const { settings } = rig({ saved: { version: 1, ui: [{ key: 'layout.flightData', value: '{"a":1}' }] } })
    await settings.load()

    expect(settings.uiValue('layout.flightData')).toBe('{"a":1}')
    expect(settings.uiValue('layout.other')).toBeUndefined()
  })

  it('is kept under its key, replacing what was there, and is there to read at once', async () => {
    const { settings, client } = rig({ saved: { version: 1, ui: [{ key: 'k', value: 'old' }, { key: 'other', value: 'x' }] } })
    await settings.load()

    await settings.setUi('k', 'new')

    expect(settings.uiValue('k')).toBe('new')
    expect(settings.uiValue('other')).toBe('x')
    const kept = (await client.call('settings.get', null)).settings.ui
    expect(kept).toEqual([{ key: 'k', value: 'new' }, { key: 'other', value: 'x' }])
  })

  it('says so when it could not be kept', async () => {
    const { settings } = refused()

    await settings.setUi('k', 'v')

    expect(settings.notice.value).toBe('A setting could not be kept: the backend is gone')
  })
})
