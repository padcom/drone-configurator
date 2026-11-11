import { expect, it } from 'vitest'
import type { SettingsState } from '@/generated/app'
import { createBackendClient } from '@/backend/client'
import { type MockControl, mockBackend, patchSettings } from './mock-backend'

it('starts on the defaults, with no notice', async () => {
  const client = createBackendClient(mockBackend())

  expect(await client.call('settings.get', null)).toEqual({ settings: { version: 1, ui: [] } })
})

it('applies a patch: adds and replaces ui entries, removes what is named, leaves the rest', () => {
  const start = { version: 1, language: 'en', ui: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }] }
  const next = patchSettings(start, { theme: 'dark', ui: [{ key: 'a', value: 'one' }, { key: 'c', value: '3' }], remove: ['b'] })

  expect(next).toEqual({
    version: 1,
    language: 'en',
    theme: 'dark',
    ui: [{ key: 'a', value: 'one' }, { key: 'c', value: '3' }],
  })
  const forgot = patchSettings(next, { remove: ['language', 'theme', 'a', 'never-there'] })

  expect(forgot).toEqual({ version: 1, ui: [{ key: 'c', value: '3' }] })
  expect(start.ui).toHaveLength(2)
})

it('answers a set with the document, announces it, and keeps it across a restart of the backend', async () => {
  const control: MockControl = {}
  const client = createBackendClient(mockBackend({ control }))
  const heard: SettingsState[] = []
  client.onEvent('settings.changed', state => heard.push(state))

  const answer = await client.call('settings.set', { language: 'pl', theme: 'dark' })

  expect(answer.settings).toEqual({ version: 1, language: 'pl', theme: 'dark', ui: [] })
  expect(heard).toEqual([answer])
  control.restart?.()
  await new Promise(resolve => {
    setTimeout(resolve, 30)
  })
  expect((await client.call('settings.get', null)).settings.language).toBe('pl')
})

it('can start with what an earlier run saved and a notice about it', async () => {
  const client = createBackendClient(mockBackend({
    settings: { version: 1, language: 'de', ui: [] },
    settingsNotice: { notice: 'the settings file was set aside', noticeCode: 'CORRUPT' },
  }))

  expect(await client.call('settings.get', null)).toEqual({
    settings: { version: 1, language: 'de', ui: [] },
    notice: 'the settings file was set aside',
    noticeCode: 'CORRUPT',
  })
})
